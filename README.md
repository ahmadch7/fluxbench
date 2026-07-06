# Fluxbench

**An interactive microcontroller pinout and datasheet companion — with live Arduino IDE / USB board detection.**

Fluxbench puts a development board's physical pinout, key specifications, default
peripheral buses, and silicon gotchas in one place, so you can plan wiring without
juggling a dozen datasheet PDFs. It also detects the board plugged into your USB port
and shows its pinout automatically.

## Features

- **Interactive pinout map** for popular boards: ESP32 DevKit V1, ESP32-S3, Arduino
  Uno / Nano / Mega / Leonardo, and NodeMCU (ESP8266).
- **Signal highlighting** — filter pins by GPIO, analog (ADC/DAC), protocol
  (SPI / I2C / UART), and critical strapping / caution pins.
- **Spec & datasheet panel** — architecture, clock, logic voltage, flash/RAM, ADC
  channels, default bus pin mappings, and links to official datasheets.
- **Silicon constraints & wiring safety** — flags input-only pins, flash pins,
  strapping/boot pins, ADC2-vs-WiFi conflicts, and 3.3 V vs 5 V hazards.
- **Live USB board detection** — when you plug a board into USB, the site identifies
  it and shows its pinout; unplug it and it clears. Genuine boards (e.g. Arduino Uno)
  are identified directly from USB; clone boards (CH340/CP2102) borrow the identity
  you've selected in the Arduino IDE.
- **Pin Planner** — assign pins to jobs (I²C, SPI, UART, a sensor, a MOSFET gate…) and
  conflicts are flagged live: double-booked pins, input-only pins driven as outputs,
  ESP32 flash (GPIO 6–11) and strapping/boot pins, and ADC2-while-Wi-Fi. Assigned pins
  light up on the board map, and the plan exports as a Markdown table.
- **Flash & Monitor** — compile and upload a sketch to the connected board straight
  from the page using the bundled `arduino-cli`, then watch (and write to) the serial
  port via the browser's Web Serial API — without switching to the Arduino IDE.
- **Peripheral code generator** — pick a board and a bus and get correct init
  boilerplate using that board's real default pins (Arduino C++ for ESP32 / ESP8266 /
  AVR / RP2040, HAL stubs for STM32).
- **Reverse pin search** — find pins by capability ("every PWM pin", "5V-tolerant",
  "interrupt", "ADC", "touch"…). Board-aware, so the answer is right per chip family.
- **Wiring helper** — pick a sensor/module (VL53L1X, BME280, MPU6050, HC-SR04,
  nRF24L01, DS18B20, NEO-6M…) and get a wiring table to the selected board plus a
  3.3 V / 5 V level-compatibility check.
- **Board compare** — line up boards side by side (specs, voltages, pin counts) to
  pick the right one for a project.
- **Serial plotter** — graph incoming serial data in real time (Arduino Serial Plotter
  format: space/comma values or `label:value`), auto-scaling, multi-series.
- **Sanity Check** — 1-click guided diagnostics: flash a tiny test firmware that blinks
  the LED and scans the I²C bus, then names the devices it finds.
- **Component snapping** — drag a part (servo, HC-SR04, I²C LCD, NeoPixel, sensors…)
  onto the board and the exact pins it connects to light up, with a voltage check.
- **Error decoder** — translates cryptic flash/bootloader errors (esptool, avrdude)
  into plain-language fixes ("hold the BOOT button and try again").
- **Installable PWA** — runs offline. Flashing, pin reference, and serial all work with
  no internet, since they run locally through the browser and `arduino-cli`.
- **Bento dashboard + landing** — a glass front door with an animated dot-field, and a
  dashboard where the board pinout is the hero with a collapsible right rail of
  settings/feature "sheets" (soft, in-theme cards; GSAP entrance).
- **Save & share** — a board + wiring plan is compressed into a `?state=` URL (lz-string),
  restored on load. No login, no database — just send the link.
- **Command palette (⌘K)** — jump to any board, feature, pin, or action (cmdk).
- **Export** — PNG/PDF of the board view for lab reports (html-to-image + jsPDF).
- **Onboarding tour** — a first-run guided tour (driver.js).
- **Dynamic catalog** — search any other chip and a pinout is generated on demand via
  the Gemini API.

## How USB detection works

The backend reads the Arduino IDE's current board selection from its local app state
and uses the IDE-bundled `arduino-cli` to see what's physically connected, then
checks the Windows serial-port list to confirm a board's port is actually present.
This is Windows-specific today (it reads `%APPDATA%/arduino-ide` and the registry's
`SERIALCOMM` list).

## Tech stack

React 19 + TypeScript, Vite, Tailwind CSS, an Express/Node backend (`server.ts`), and
the Google Gemini API for the dynamic catalog.

## Run locally

**Prerequisites:** Node.js. (USB detection additionally expects Arduino IDE 2.x
installed.)

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set your `GEMINI_API_KEY` (only needed for the
   dynamic catalog; the preloaded boards work without it).
3. Run the app: `npm run dev`
4. Open http://localhost:3000

## A note on data accuracy

The preloaded boards are hand-verified. Boards produced by the dynamic catalog are
AI-generated and should be cross-checked against the manufacturer datasheet before you
wire anything up — never trust a generated pin label with real voltage on the line.

---

Built by Ahmad Chahoud.
