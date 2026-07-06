/* Vercel serverless function: public AI chip-search.
 * Mirrors the /api/microcontrollers/specs endpoint from server.ts so the
 * dynamic catalog works on the deployed site. Set GEMINI_API_KEY in the
 * Vercel project's Environment Variables. */
import { GoogleGenAI, Type } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const query = body.query;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing 'query' string in request body" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(403).json({
      error: "GEMINI_API_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables to enable real-time queries.",
      isOfflineDemo: true,
      query,
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Search the datasheet, specifications, and layout for the following microcontroller or development board: "${query}".
Deliver a highly accurate, comprehensive dataset for planning circuit wiring.
Specifically list as many pins as key and possible with their associated designations.
For cautions, flag voltage levels (e.g. if 3.3V only and NOT 5V tolerant, strapping pins affecting boot, or internal flash pins to avoid for ESP boards).
Format physical pin numbers as they map on the dev board, or standard chip package if it's a IC.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "You are an expert embedded systems compiler and electrical engineer specializing in microcontroller pinouts, datasheets, and peripheral mapping.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            specs: {
              type: Type.OBJECT,
              properties: {
                architecture: { type: Type.STRING },
                clockSpeed: { type: Type.STRING },
                operatingVoltage: { type: Type.STRING },
                flashMemory: { type: Type.STRING },
                ramSize: { type: Type.STRING },
                gpioCount: { type: Type.INTEGER },
                adcChannels: { type: Type.STRING },
                dacChannels: { type: Type.STRING },
                interfaces: { type: Type.STRING },
              },
              required: ["architecture", "clockSpeed", "operatingVoltage", "flashMemory", "ramSize"],
            },
            pins: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  number: { type: Type.STRING },
                  name: { type: Type.STRING },
                  gpio: { type: Type.STRING },
                  features: { type: Type.ARRAY, items: { type: Type.STRING } },
                  primary: { type: Type.STRING },
                  caution: { type: Type.STRING },
                  isCaution: { type: Type.BOOLEAN },
                },
                required: ["number", "name", "features", "primary", "isCaution"],
              },
            },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            peripherals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  interfaceType: { type: Type.STRING },
                  pinsUsed: { type: Type.STRING },
                },
                required: ["interfaceType", "pinsUsed"],
              },
            },
          },
          required: ["name", "description", "specs", "pins", "warnings"],
        },
      },
    });

    res.status(200).json(JSON.parse(response.text || "{}"));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to extract datasheet information. " + (err?.message || "") });
  }
}
