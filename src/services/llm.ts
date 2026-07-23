import { GoogleGenAI } from "@google/genai";

export async function generateMessage(
  prompt: string,
  modelName: string = "gemini-3.1-flash-lite"
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY is not set. Returning mock response.");
    return "[Mock Output] 今日は水飲むだけで100点やで。無理せんとこな。";
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: "あなたは指示に忠実なLINE伴走Botです。出力指定を厳守してください。",
        temperature: 0.7,
      },
    });

    return response.text?.trim() ?? "";
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    console.error("[Gemini API Error Detail]:", errorDetail);
    throw err;
  }
}
