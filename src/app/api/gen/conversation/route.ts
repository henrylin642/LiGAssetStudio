import { NextRequest, NextResponse } from "next/server";
import type { NanoGenerationSpec } from "@/types/generation";

const GEMINI_API_BASE = process.env.GEMINI_API_BASE_URL?.replace(/\/+$/, "") || "https://generativelanguage.googleapis.com/v1beta";
const rawGeminiModel = process.env.GEMINI_MODEL || "models/gemini-1.5-pro";
const GEMINI_MODEL = rawGeminiModel.startsWith("models/") ? rawGeminiModel : `models/${rawGeminiModel}`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY;

const SYSTEM_PROMPT =
  "You are an AR/VR creative director assistant. Always respond with strict JSON using this schema: " +
  '{"reply":"給使用者的文字","spec":{"mode":"text","prompt":"","negativePrompt":"","style":"","aspectRatio":"1:1","count":1,"referenceImages":[]}}. ' +
  "Use Traditional Chinese for reply. spec.mode 僅能是 text/image/remix，count 介於 1-4，referenceImages 為 URL 陣列。若使用者缺資料，請在 reply 中詢問。";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

type GeminiCandidate = {
  content?: {
    role?: string;
    parts?: GeminiPart[];
  };
};

const DEFAULT_SPEC: NanoGenerationSpec = {
  mode: "text",
  prompt: "",
  negativePrompt: "",
  style: "photography",
  aspectRatio: "1:1",
  count: 1,
  referenceImages: [],
};

function buildGeminiPayload(messages: ConversationMessage[]) {
  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  return {
    contents,
    systemInstruction: {
      role: "user",
      parts: [{ text: SYSTEM_PROMPT }],
    },
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      candidateCount: 1,
    },
  };
}

function extractText(candidate: GeminiCandidate | undefined) {
  if (!candidate?.content?.parts?.length) return null;
  return candidate.content.parts
    .map((part) => ("text" in part ? part.text : null))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function sanitizeSpec(raw: Partial<NanoGenerationSpec> | undefined): NanoGenerationSpec {
  const mode = raw?.mode === "image" || raw?.mode === "remix" ? raw.mode : "text";
  const prompt = typeof raw?.prompt === "string" ? raw.prompt.trim() : "";
  const negativePrompt = typeof raw?.negativePrompt === "string" ? raw.negativePrompt.trim() : undefined;
  const style = typeof raw?.style === "string" ? raw.style.trim() : undefined;
  const aspectRatio = typeof raw?.aspectRatio === "string" ? raw.aspectRatio.trim() : undefined;
  const count = Number.isFinite(raw?.count) ? Math.min(Math.max(Number(raw?.count), 1), 4) : 1;
  const referenceImages = Array.isArray(raw?.referenceImages)
    ? raw.referenceImages.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    ...DEFAULT_SPEC,
    mode,
    prompt,
    negativePrompt,
    style,
    aspectRatio,
    count,
    referenceImages,
  };
}

function tryParseStructured(text: string) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if ("spec" in parsed) {
        return {
          reply: typeof (parsed as { reply?: string }).reply === "string" ? (parsed as { reply?: string }).reply ?? "" : text,
          spec: sanitizeSpec((parsed as { spec?: Partial<NanoGenerationSpec> }).spec),
        };
      }
      return {
        reply: typeof (parsed as { reply?: string }).reply === "string" ? (parsed as { reply?: string }).reply ?? "" : text,
        spec: sanitizeSpec(parsed as Partial<NanoGenerationSpec>),
      };
    }
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const substring = text.slice(start, end + 1);
        const parsed = JSON.parse(substring);
        if (parsed && typeof parsed === "object") {
          return {
            reply: typeof (parsed as { reply?: string }).reply === "string" ? (parsed as { reply?: string }).reply ?? "" : text,
            spec: sanitizeSpec((parsed as { spec?: Partial<NanoGenerationSpec> }).spec ?? (parsed as Partial<NanoGenerationSpec>)),
          };
        }
      } catch {
        // ignore
      }
    }
  }
  return { reply: text, spec: DEFAULT_SPEC };
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "缺少 GEMINI_API_KEY" }, { status: 500 });
    }

    const body = (await request.json()) as { messages: ConversationMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "請先輸入訊息" }, { status: 400 });
    }

    const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = buildGeminiPayload(messages);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const message = typeof err?.error?.message === "string" ? err.error.message : `Gemini error (${response.status})`;
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = (await response.json()) as { candidates?: GeminiCandidate[] };
    const text = extractText(data.candidates?.[0]) ?? "(沒有回覆內容)";
    const structured = tryParseStructured(text);

    return NextResponse.json({ message: structured.reply, spec: structured.spec });
  } catch (error) {
    console.error("Gemini conversation failed", error);
    return NextResponse.json({ error: "LLM 對話失敗" }, { status: 500 });
  }
}
