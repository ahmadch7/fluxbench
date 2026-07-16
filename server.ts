import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

/* ------------------------------------------------------------------ *
 *  COMPANION-MODE CORS
 *  The public site (fluxbench.vercel.app) can't reach this machine's
 *  USB — but the visitor's BROWSER can reach this server on localhost.
 *  So we let the Fluxbench frontend, when served from Vercel, call our
 *  /api endpoints cross-origin. WHY the allowlist instead of "*": these
 *  endpoints can compile and flash firmware, so we only trust our own
 *  production + preview domains — a random website must not be able to
 *  drive this server from a hidden fetch().
 * ------------------------------------------------------------------ */
const ALLOWED_COMPANION_ORIGINS = [
  /^https:\/\/fluxbench\.vercel\.app$/,
  /^https:\/\/fluxbench-[a-z0-9-]+\.vercel\.app$/, // Vercel preview/branch deploys
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_COMPANION_ORIGINS.some((re) => re.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  // Preflight: answer immediately so POSTs (compile/upload) pass.
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/* ------------------------------------------------------------------ *
 *  ARDUINO IDE LIVE BOARD SYNC
 *  Reads the board you currently have selected in Arduino IDE 2.x and
 *  exposes it at GET /api/arduino/board so the website can mirror it.
 *
 *  How it works (Windows):
 *   - Arduino IDE 2.x is Electron/Theia. When you pick a board in
 *     Tools > Board, it saves it to the renderer's localStorage, which
 *     Chromium persists to a LevelDB at:
 *       %APPDATA%\arduino-ide\Local Storage\leveldb
 *     under the key  theia:<sketch-uri>:arduino-ide:selectedBoard
 *     with a JSON value { "name": "...", "fqbn": "..." }.
 *   - We read the raw LevelDB files (no lock needed - shared read) and
 *     extract that value for the most-recently-opened sketch.
 *   - arduino-cli (bundled with the IDE) tells us whether a board is
 *     physically connected and on which COM port. Note: the USB chip on
 *     most ESP32/clone boards is generic, so arduino-cli usually can NOT
 *     identify the *model* - that's why the model comes from the IDE
 *     selection above, not from the port.
 *
 *  This reads internal IDE state, so it is inherently version-fragile:
 *  a future Arduino IDE could change the key name or storage format.
 *  If that happens, this endpoint returns board:null and the site just
 *  stops auto-syncing (everything else keeps working).
 * ------------------------------------------------------------------ */

interface DetectedBoard {
  name: string;
  fqbn: string;
  workspaceUri: string;
  idePort?: string | null; // COM port the IDE has paired with this board
}

function getLevelDbDir(): string {
  const appData =
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "arduino-ide", "Local Storage", "leveldb");
}

// Most-recently-opened sketch = highest timestamp in recent-sketches.json.
// That tells us which workspace's board selection is the "current" one.
function getActiveSketchUri(): string | null {
  try {
    const f = path.join(os.homedir(), ".arduinoIDE", "recent-sketches.json");
    const obj = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, number>;
    let best: string | null = null;
    let bestT = -1;
    for (const [uri, t] of Object.entries(obj)) {
      if (typeof t === "number" && t > bestT) {
        bestT = t;
        best = uri;
      }
    }
    return best;
  } catch {
    return null;
  }
}

// Pull every "selectedBoard" entry out of one raw LevelDB file blob.
function extractSelectedBoards(
  blob: string
): { workspaceUri: string; name: string; fqbn: string; at: number }[] {
  // localStorage values are JSON-stringified, so the inner JSON is
  // backslash-escaped in the raw bytes. Un-escape, then scan.
  const deesc = blob.replace(/\\"/g, '"');
  const out: { workspaceUri: string; name: string; fqbn: string; at: number }[] = [];
  const keyRe = /theia:(file:[^\x00-\x1f"]+?):arduino-ide:selectedBoard/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(deesc)) !== null) {
    const uri = m[1];
    // The value sits right after the key in the same LevelDB record. Bound the
    // search window to just before the NEXT theia: key so we never read fields
    // belonging to a different entry.
    let end = deesc.indexOf("theia:", m.index + 10);
    if (end < 0 || end - m.index > 400) end = Math.min(deesc.length, m.index + 400);
    const win = deesc.slice(m.index, end);
    // IMPORTANT: different boards serialize the value with different key order
    // (ESP32 writes {"name":...,"fqbn":...}; Uno writes {"fqbn":...,"name":...}),
    // so match the two fields INDEPENDENTLY rather than assuming an order.
    const fq = win.match(/"fqbn":"([^"]+)"/);
    const nm = win.match(/"name":"([^"]+)"/);
    if (fq) out.push({ workspaceUri: uri, name: nm ? nm[1] : fq[1], fqbn: fq[1], at: m.index });
  }
  return out;
}

// Same idea, for the selected PORT. The IDE stores, per sketch, the COM port
// it has paired with the board, e.g. {"address":"COM6",...}. It KEEPS this even
// after you unplug (just like the IDE showing "on COM6 [not connected]"), so we
// use it to know which port to check for presence.
function extractSelectedPorts(
  blob: string
): { workspaceUri: string; address: string; at: number }[] {
  const deesc = blob.replace(/\\"/g, '"');
  const out: { workspaceUri: string; address: string; at: number }[] = [];
  const keyRe = /theia:(file:[^\x00-\x1f"]+?):arduino-ide:selectedPort/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(deesc)) !== null) {
    const uri = m[1];
    let end = deesc.indexOf("theia:", m.index + 10);
    if (end < 0 || end - m.index > 400) end = Math.min(deesc.length, m.index + 400);
    const win = deesc.slice(m.index, end);
    const ad = win.match(/"address":"([^"]+)"/);
    if (ad) out.push({ workspaceUri: uri, address: ad[1], at: m.index });
  }
  return out;
}

function readSelectedBoardFromIde(): DetectedBoard | null {
  const dir = getLevelDbDir();
  if (!fs.existsSync(dir)) return null;

  // Freshest writes live in the .log (write-ahead log), then .ldb tables.
  // Rank .log first, then .ldb by newest mtime.
  let files: { p: string; isLog: boolean; m: number }[];
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".log") || f.endsWith(".ldb"))
      .map((f) => {
        const p = path.join(dir, f);
        return { p, isLog: f.endsWith(".log"), m: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => Number(b.isLog) - Number(a.isLog) || b.m - a.m);
  } catch {
    return null;
  }

  const activeUri = getActiveSketchUri();
  // Per workspace, keep the entry from the freshest file / latest position.
  const perUri = new Map<
    string,
    { rec: DetectedBoard; rank: number; at: number }
  >();
  let freshest: { rec: DetectedBoard; rank: number; at: number } | null = null;
  // Freshest selected PORT per workspace (separate key in the same store).
  const portPerUri = new Map<string, { address: string; rank: number; at: number }>();

  files.forEach(({ p }, rank) => {
    let blob: string;
    try {
      blob = fs.readFileSync(p, "latin1");
    } catch {
      return;
    }
    for (const r of extractSelectedBoards(blob)) {
      const rec: DetectedBoard = {
        name: r.name,
        fqbn: r.fqbn,
        workspaceUri: r.workspaceUri,
      };
      const prev = perUri.get(r.workspaceUri);
      if (!prev || rank < prev.rank || (rank === prev.rank && r.at > prev.at)) {
        perUri.set(r.workspaceUri, { rec, rank, at: r.at });
      }
      if (!freshest || rank < freshest.rank || (rank === freshest.rank && r.at > freshest.at)) {
        freshest = { rec, rank, at: r.at };
      }
    }
    for (const r of extractSelectedPorts(blob)) {
      const prev = portPerUri.get(r.workspaceUri);
      if (!prev || rank < prev.rank || (rank === prev.rank && r.at > prev.at)) {
        portPerUri.set(r.workspaceUri, { address: r.address, rank, at: r.at });
      }
    }
  });

  // Prefer the FRESHEST write: that is the board the user most recently
  // selected, in whichever window/sketch they last touched. This also covers
  // brand-new unsaved sketches, which never appear in recent-sketches.json.
  // Fall back to the active saved sketch only if no fresh write was found.
  let chosen: DetectedBoard | null = null;
  if (freshest) chosen = (freshest as { rec: DetectedBoard }).rec;
  else if (activeUri && perUri.has(activeUri)) chosen = perUri.get(activeUri)!.rec;
  if (!chosen) return null;

  // Attach the port the IDE paired with this board (same sketch), if any.
  const portRec = portPerUri.get(chosen.workspaceUri);
  chosen.idePort = portRec ? portRec.address : null;
  return chosen;
}

// Current serial/COM ports that ACTUALLY exist on the machine right now.
// Read straight from the Windows registry (SERIALCOMM) - this is instant and
// reflects plug/unplug immediately, unlike arduino-cli's slow discovery scan.
function getLiveSerialPorts(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "reg",
      ["query", "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM"],
      { timeout: 4000, windowsHide: true },
      (_err, stdout) => {
        if (!stdout) return resolve([]);
        const ports = [...stdout.matchAll(/REG_SZ\s+(COM\d+)/g)].map((m) => m[1]);
        resolve([...new Set(ports)]);
      }
    );
  });
}

// Locate the arduino-cli that ships inside Arduino IDE 2.x.
function getBundledArduinoCli(): string | null {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(
      localAppData,
      "Programs",
      "Arduino IDE",
      "resources",
      "app",
      "lib",
      "backend",
      "resources",
      "arduino-cli.exe"
    ),
    path.join(
      process.env.PROGRAMFILES || "C:\\Program Files",
      "Arduino IDE",
      "resources",
      "app",
      "lib",
      "backend",
      "resources",
      "arduino-cli.exe"
    ),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

// Ask arduino-cli which ports have a board attached. Best-effort; the
// model often can't be identified from USB, but the port tells us a board
// is physically present.
function getConnectedPorts(): Promise<
  {
    address: string;
    protocol: string;
    vid?: string;
    pid?: string;
    detectedName?: string;
    detectedFqbn?: string;
  }[]
> {
  return new Promise((resolve) => {
    const cli = getBundledArduinoCli();
    if (!cli) return resolve([]);
    execFile(
      cli,
      // --discovery-timeout gives USB enumeration time to find ALL ports;
      // without it a quick scan sometimes misses a just-plugged board.
      ["board", "list", "--discovery-timeout", "2s", "--format", "json"],
      { timeout: 15000 },
      (err, stdout) => {
        // Even on a (timeout) error, arduino-cli often still printed valid
        // JSON to stdout - parse it rather than discarding everything.
        if (!stdout) return resolve([]);
        try {
          const data = JSON.parse(stdout);
          const ports = (data.detected_ports || [])
            .filter((dp: any) => dp?.port?.protocol === "serial")
            .map((dp: any) => {
              const match = (dp.matching_boards || [])[0];
              const props = dp.port.properties || {};
              return {
                address: dp.port.address,
                protocol: dp.port.protocol,
                vid: props.vid as string | undefined, // present only for real USB devices
                pid: props.pid as string | undefined,
                detectedName: match?.name,
                detectedFqbn: match?.fqbn,
              };
            });
          resolve(ports);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

// The endpoint the website polls. USB-DRIVEN: it reports the board(s) actually
// plugged into a USB port right now. Unplug a board and it disappears - exactly
// like the Arduino IDE's port detection.
app.get("/api/arduino/board", async (_req, res) => {
  try {
    // What the user has selected in the IDE - used only to put a name on USB
    // boards that can't identify themselves (ESP32 clones on CH340/CP2102).
    const ideBoard = readSelectedBoardFromIde();
    const cliPorts = await getConnectedPorts();

    // Real USB boards only: a vid/pid means a USB device is attached. This
    // automatically excludes phantom/legacy ports like COM3 (\Device\Serial0),
    // which carry no vid/pid.
    const usbPorts = cliPorts.filter((p) => p.vid);

    const connectedBoards = usbPorts.map((p) => {
      if (p.detectedFqbn) {
        // Genuine board - arduino-cli identified it straight from USB.
        return {
          name: p.detectedName || p.detectedFqbn,
          fqbn: p.detectedFqbn,
          port: p.address,
          identified: true,
          via: "usb",
        };
      }
      if (ideBoard && ideBoard.idePort && ideBoard.idePort === p.address) {
        // Unidentifiable USB chip, but the IDE has this exact port paired to a
        // board the user picked - borrow that identity.
        return {
          name: ideBoard.name,
          fqbn: ideBoard.fqbn,
          port: p.address,
          identified: true,
          via: "ide-pairing",
        };
      }
      // USB board we genuinely can't name (clone, no IDE pairing).
      return {
        name: "Unknown board",
        fqbn: "",
        port: p.address,
        identified: false,
        via: "unknown",
        usbId: [p.vid, p.pid].filter(Boolean).join(":"),
      };
    });

    // Which one to feature: the board matching the IDE's current selection if
    // it's plugged in; otherwise the first identified board; otherwise the first
    // connected board.
    let board =
      connectedBoards.find(
        (b) => ideBoard && b.fqbn && b.fqbn === ideBoard.fqbn
      ) ||
      connectedBoards.find((b) => b.identified) ||
      connectedBoards[0] ||
      null;

    res.json({
      ok: true,
      board, // the featured connected board, or null if nothing is plugged in
      connected: !!board,
      connectedBoards, // every USB board currently attached
      ts: Date.now(),
    });
  } catch (err: any) {
    res.json({ ok: false, board: null, connected: false, connectedBoards: [], error: err?.message });
  }
});

/* ------------------------------------------------------------------ *
 *  COMPILE / UPLOAD  —  flash a sketch straight from the website using
 *  the arduino-cli bundled with Arduino IDE. Cores are shared with the
 *  IDE (Arduino15 data dir), so whatever compiles in the IDE compiles here.
 * ------------------------------------------------------------------ */

function uriToWinPath(uri: string): string {
  let p = uri.replace(/^file:\/\/\//, "");
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  return p.replace(/\//g, "\\");
}

// arduino-cli wants the sketch FOLDER (the one named like the .ino inside it).
function sketchDirOf(p: string): string {
  return /\.ino$/i.test(p) ? path.dirname(p) : p;
}

// Recently-opened sketches that still exist on disk and contain a .ino.
function listRecentSketches(): { name: string; path: string; ts: number }[] {
  try {
    const f = path.join(os.homedir(), ".arduinoIDE", "recent-sketches.json");
    const obj = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, number>;
    const seen = new Set<string>();
    const out: { name: string; path: string; ts: number }[] = [];
    for (const [uri, ts] of Object.entries(obj)) {
      const dir = sketchDirOf(uriToWinPath(uri));
      const key = dir.toLowerCase();
      if (seen.has(key)) continue;
      try {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
        // A real Arduino sketch folder contains <folderName>.ino.
        const base = path.basename(dir).toLowerCase();
        const inos = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(".ino"));
        if (!inos.some((n) => n.toLowerCase() === `${base}.ino`)) continue;
      } catch {
        continue;
      }
      seen.add(key);
      out.push({ name: path.basename(dir), path: dir, ts: typeof ts === "number" ? ts : 0 });
    }
    return out.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

function runArduinoCli(
  args: string[],
  timeoutMs = 180000
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const cli = getBundledArduinoCli();
    if (!cli) return resolve({ success: false, output: "arduino-cli not found — is Arduino IDE installed?" });
    execFile(
      cli,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const output = `${stdout || ""}${stderr || ""}`.trim();
        resolve({ success: !err, output: output || (err ? String((err as any).message) : "") });
      }
    );
  });
}

app.get("/api/arduino/sketches", (_req, res) => {
  const sketches = listRecentSketches();
  res.json({ ok: true, sketches, active: sketches[0]?.path || null });
});

app.post("/api/arduino/compile", async (req, res) => {
  let { path: sketch, fqbn } = (req.body || {}) as { path?: string; fqbn?: string };
  if (!fqbn) fqbn = readSelectedBoardFromIde()?.fqbn;
  if (!sketch) sketch = listRecentSketches()[0]?.path;
  if (!sketch || !fqbn) {
    return res.json({ ok: false, success: false, output: "Need a sketch and a board (FQBN) — open a sketch and select a board in the Arduino IDE." });
  }
  const r = await runArduinoCli(["compile", "--fqbn", fqbn, sketch]);
  res.json({ ok: true, success: r.success, output: r.output, sketch, fqbn });
});

app.post("/api/arduino/upload", async (req, res) => {
  let { path: sketch, fqbn, port } = (req.body || {}) as { path?: string; fqbn?: string; port?: string };
  const ide = readSelectedBoardFromIde();
  if (!fqbn) fqbn = ide?.fqbn;
  if (!port) {
    const cli = await getConnectedPorts();
    port = cli.find((p) => p.detectedFqbn)?.address || cli.find((p) => p.vid)?.address || ide?.idePort || undefined;
  }
  if (!sketch) sketch = listRecentSketches()[0]?.path;
  if (!sketch || !fqbn || !port) {
    return res.json({ ok: false, success: false, output: "Need a sketch, a board (FQBN), and a connected port." });
  }
  // compile + upload in one shot so the flash is always fresh.
  const r = await runArduinoCli(["compile", "--upload", "-p", port, "--fqbn", fqbn, sketch]);
  res.json({ ok: true, success: r.success, output: r.output, sketch, fqbn, port });
});

/* ------------------------------------------------------------------ *
 *  SANITY CHECK  —  flash a tiny diagnostic firmware that blinks the
 *  built-in LED and scans the I2C bus, printing found addresses over
 *  serial. Board-agnostic: Wire.begin() and LED_BUILTIN use each core's
 *  defaults, so it works on ESP32 / AVR / ESP8266 / RP2040 without pin info.
 * ------------------------------------------------------------------ */
const DIAGNOSTIC_SKETCH = `#include <Wire.h>
#ifndef LED_BUILTIN
#define LED_BUILTIN 2
#endif

void setup() {
  Serial.begin(115200);
  delay(400);
  pinMode(LED_BUILTIN, OUTPUT);
  Wire.begin();
  Serial.println("SANITY-CHECK READY");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);   // LED on during scan
  int n = 0;
  Serial.println("I2C-SCAN-BEGIN");
  for (uint8_t a = 1; a < 127; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.print("FOUND 0x");
      if (a < 16) Serial.print('0');
      Serial.println(a, HEX);
      n++;
    }
    delay(2);
  }
  Serial.print("I2C-SCAN-END ");
  Serial.println(n);
  digitalWrite(LED_BUILTIN, LOW);    // off between scans -> visible blink
  delay(1200);
}
`;

app.post("/api/arduino/diagnostic", async (req, res) => {
  let { fqbn, port } = (req.body || {}) as { fqbn?: string; port?: string };
  const ide = readSelectedBoardFromIde();
  if (!fqbn) fqbn = ide?.fqbn;
  if (!port) {
    const cli = await getConnectedPorts();
    port = cli.find((p) => p.detectedFqbn)?.address || cli.find((p) => p.vid)?.address || ide?.idePort || undefined;
  }
  if (!fqbn || !port) {
    return res.json({ ok: false, success: false, output: "Need a board (FQBN) and a connected port — plug a board in." });
  }
  try {
    const dir = path.join(os.tmpdir(), "micropin_sanity");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "micropin_sanity.ino"), DIAGNOSTIC_SKETCH);
    const r = await runArduinoCli(["compile", "--upload", "-p", port, "--fqbn", fqbn, dir]);
    res.json({ ok: true, success: r.success, output: r.output, fqbn, port });
  } catch (err: any) {
    res.json({ ok: false, success: false, output: "Failed to write/flash diagnostic: " + (err?.message || err) });
  }
});

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Real-time AI database lookups will fail back to mock examples.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY_NOT_SET",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// REST route for hardware specifications lookup
app.post("/api/microcontrollers/specs", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing 'query' string in request body" });
    return;
  }

  // Check if API key is present; otherwise fail or return sample data
  if (!process.env.GEMINI_API_KEY) {
    res.status(403).json({
      error: "GEMINI_API_KEY is not set in Secrets. Please add your GEMINI_API_KEY in Settings > Secrets to enable real-time queries for any microcontroller.",
      isOfflineDemo: true,
      query: query
    });
    return;
  }

  try {
    const ai = getAiClient();
    
    const prompt = `Search the datasheet, specifications, and layout for the following microcontroller or development board: "${query}".
Deliver a highly accurate, comprehensive dataset for planning circuit wiring. 
Specifically list as many pins as key and possible with their associated designations. 
For cautions, flag voltage levels (e.g. if 3.3V only and NOT 5V tolerant, strapping pins affecting boot, or internal flash pins to avoid for ESP boards). 
Format physical pin numbers as they map on the dev board, or standard chip package if it's a IC.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are an expert embedded systems compiler and electrical engineer specializing in microcontroller pinouts, datasheets, and peripheral mapping.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { 
              type: Type.STRING, 
              description: "Official name of the microcontroller or board, e.g. 'STM32F103C8T6 Blue Pill'" 
            },
            description: { 
              type: Type.STRING, 
              description: "A professional 1-2 sentence overview of its core processor, applications, and general form factor." 
            },
            specs: {
              type: Type.OBJECT,
              properties: {
                architecture: { type: Type.STRING, description: "e.g. ARM Cortex-M3, Xtensa Dual-Core 32-bit, AVR RISC" },
                clockSpeed: { type: Type.STRING, description: "e.g. 72 MHz, 240 MHz, 16 MHz" },
                operatingVoltage: { type: Type.STRING, description: "Logical high/operating safe voltage, e.g. 3.3V (5V Tolerant on some pins) or 5.0V" },
                flashMemory: { type: Type.STRING, description: "e.g. 64 KB, 4 MB, 32 KB" },
                ramSize: { type: Type.STRING, description: "e.g. 20 KB, 520 KB, 2 KB" },
                gpioCount: { type: Type.INTEGER, description: "Number of generic GPIO pins" },
                adcChannels: { type: Type.STRING, description: "e.g. 10 Channels (12-bit)" },
                dacChannels: { type: Type.STRING, description: "e.g. None or 2 Channels (8-bit)" },
                interfaces: { type: Type.STRING, description: "Available protocols count e.g. 2x I2C, 2x SPI, 3x USART" }
              },
              required: ["architecture", "clockSpeed", "operatingVoltage", "flashMemory", "ramSize"]
            },
            pins: {
              type: Type.ARRAY,
              description: "A comprehensive list of physical pins with names, functions, and critical notes.",
              items: {
                type: Type.OBJECT,
                properties: {
                  number: { type: Type.STRING, description: "Physical pin number or grid index on the package/board layout, e.g., '1', 'A5'" },
                  name: { type: Type.STRING, description: "Pin name printed on silkscreen or datasheet, e.g. 'PA0', 'VCC', 'GND', 'GPIO34'" },
                  gpio: { type: Type.STRING, description: "GPIO mapping integer if applicable, or 'N/A' if power/ground/reset" },
                  features: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Array of capabilities, e.g. ['GPIO', 'ADC1_IN0', 'PWM', 'USART2_CTS']" 
                  },
                  primary: { type: Type.STRING, description: "The most common / default usage of the pin, e.g., 'Analog Input', 'Digital I/O', '3.3V Power Out'" },
                  caution: { type: Type.STRING, description: "Details if this pin requires special attention, else empty. e.g. 'Input only', 'Strapping pin (GPIO0)', 'Tied to SPI flash (Do not use)'" },
                  isCaution: { type: Type.BOOLEAN, description: "true if wiring incorrectly could break/freeze the board or boot flow" }
                },
                required: ["number", "name", "features", "primary", "isCaution"]
              }
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Important precautions to avoid damaging the microcontroller or causing unstable behavior."
            },
            peripherals: {
              type: Type.ARRAY,
              description: "Default pins dedicated to communication protocols, e.g. I2C (SDA/SCL), SPI (MOSI/MISO/SCK/SS), UART (TX/RX)",
              items: {
                type: Type.OBJECT,
                properties: {
                  interfaceType: { type: Type.STRING, description: "Interface moniker, e.g. 'I2C0', 'SPI', 'UART1'" },
                  pinsUsed: { type: Type.STRING, description: "The specific pins mapped to this protocol by default, e.g. 'SDA: GPIO21, SCL: GPIO22'" }
                },
                required: ["interfaceType", "pinsUsed"]
              }
            }
          },
          required: ["name", "description", "specs", "pins", "warnings"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (err: any) {
    console.error("Gemini lookup failed: ", err);
    res.status(500).json({ 
      error: "Failed to extract datasheet information. " + (err.message || ""), 
      details: err 
    });
  }
});

// Configure Vite middleware and static serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on host 0.0.0.0, port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server: ", err);
});
