import { GoogleGenAI } from "@google/genai";

// @lat: [[llm#Gemini API Client]]
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
        systemInstruction: "あなたは指示に忠実なLINE伴走Bot ARESです。出力指定を厳守してください。",
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

// @lat: [[llm#Gemini API Client]]
export async function generateMessageMultimodal(
  prompt: string,
  imageBuffer?: Buffer,
  mimeType: string = "image/jpeg",
  modelName: string = "gemini-2.5-flash"
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY is not set. Returning mock response.");
    return "[Mock Output] 成果物の画像を承認したで。ナイス👍";
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const contents: Array<string | { inlineData: { mimeType: string, data: string } }> = [prompt];
    if (imageBuffer) {
      contents.unshift({
        inlineData: {
          mimeType,
          data: imageBuffer.toString("base64")
        }
      });
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: "あなたは指示に忠実なLINE伴走Bot ARESです。提出された成果物のエビデンス（画像など）を厳格に審査してください。",
        temperature: 0.2, // low temperature for deterministic evaluation
      },
    });

    return response.text?.trim() ?? "";
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    console.error("[Gemini Multimodal API Error Detail]:", errorDetail);
    throw err;
  }
}
