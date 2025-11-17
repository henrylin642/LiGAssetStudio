import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NANO_BANANA_BASE_URL?.replace(/\/+$/, "");
const API_KEY = process.env.NANO_BANANA_API_KEY;

export const runtime = "nodejs";

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function compactPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

async function encodeFile(file: FormDataEntryValue | null) {
  if (!file || !(file instanceof File)) return undefined;
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${file.type};base64,${base64}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!BASE_URL || !API_KEY) {
      return NextResponse.json(
        {
          error: "Nano Banana API 尚未設定，請配置 NANO_BANANA_BASE_URL 與 NANO_BANANA_API_KEY 環境變數。",
          images: [],
        },
        { status: 501 },
      );
    }

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    let prompt = "";
    let payload: Record<string, unknown> = {};

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        mode?: string;
        prompt?: string;
        negativePrompt?: string;
        count?: number;
        style?: string;
        aspectRatio?: string;
        guidance?: number;
        seed?: number;
      };

      prompt = (body.prompt ?? "").trim();
      if (!prompt) {
        return NextResponse.json({ error: "Prompt 為必填欄位。" }, { status: 400 });
      }

      const mode = (body.mode ?? "text").trim() || "text";
      const count = clamp(Number(body.count ?? 1), 1, 4);
      const guidance = body.guidance === undefined ? undefined : clamp(Number(body.guidance), 0, 20);
      const seed =
        body.seed === undefined
          ? undefined
          : Number.isNaN(Number(body.seed))
            ? undefined
            : Math.floor(Number(body.seed));

      payload = compactPayload({
        mode,
        prompt,
        count,
        negativePrompt: body.negativePrompt?.trim() || undefined,
        style: body.style?.trim() || undefined,
        aspectRatio: body.aspectRatio?.trim() || undefined,
        guidance,
        seed,
      });
    } else {
      const formData = await request.formData();
      const mode = (formData.get("mode") as string) ?? "text";
      prompt = (formData.get("prompt") as string) ?? "";
      const strength = Number(formData.get("strength") ?? 0.6);

      const imageA = formData.get("imageA");
      const imageB = formData.get("imageB");

      const imageAData = await encodeFile(imageA);
      const imageBData = await encodeFile(imageB);

      payload = compactPayload({
        mode,
        prompt,
        strength,
        imageA: imageAData,
        imageB: imageBData,
      });
    }

    const useGemini = BASE_URL.includes("generativelanguage.googleapis.com");
    const images = useGemini
      ? await generateViaGemini(payload as Record<string, unknown>)
      : await generateViaLegacy(payload as Record<string, unknown>);

    if (!images.length) {
      return NextResponse.json({ error: "Nano Banana 未回傳圖像，請稍後再試。" }, { status: 502 });
    }

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Nano Banana API failure", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nano Banana 生成失敗" },
      { status: 500 },
    );
  }
}

async function generateViaLegacy(payload: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    const errorMessage =
      (message?.error && typeof message.error === "string"
        ? message.error
        : message?.message && typeof message.message === "string"
          ? message.message
          : `Nano Banana API error (${response.status})`);
    throw new Error(errorMessage);
  }

  const json = (await response.json()) as {
    images?: Array<{ id?: string; base64?: string; url?: string; prompt?: string }>;
  };

  return (json.images ?? [])
    .map((image, index) => {
      if (image.url) {
        return { id: image.id ?? `remote-${index}`, url: image.url, prompt: image.prompt };
      }
      if (image.base64) {
        return { id: image.id ?? `remote-${index}`, url: `data:image/png;base64,${image.base64}`, prompt: image.prompt };
      }
      return null;
    })
    .filter(Boolean) as Array<{ id: string; url: string; prompt?: string }>;
}

async function generateViaGemini(payload: Record<string, unknown>) {
  const endpoint = `${BASE_URL}:generateContent?key=${API_KEY}`;
  const promptSegments: string[] = [];
  if (typeof payload.prompt === "string") {
    promptSegments.push(`主要描述: ${payload.prompt}`);
  }
  if (typeof payload.negativePrompt === "string" && payload.negativePrompt.trim()) {
    promptSegments.push(`避免元素: ${payload.negativePrompt}`);
  }
  if (typeof payload.style === "string" && payload.style.trim()) {
    promptSegments.push(`風格: ${payload.style}`);
  }
  if (typeof payload.aspectRatio === "string" && payload.aspectRatio.trim()) {
    promptSegments.push(`畫面比例: ${payload.aspectRatio}`);
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: promptSegments.join("\n") || "請產生一張創意海報" }],
      },
    ],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = typeof err?.error?.message === "string" ? err.error.message : `Gemini error (${response.status})`;
    throw new Error(message);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }>;
  };

  const images: Array<{ id: string; url: string; prompt?: string }> = [];
  data.candidates?.forEach((candidate, candidateIndex) => {
    candidate.content?.parts?.forEach((part, partIndex) => {
      if (part.inlineData && part.inlineData.mimeType?.startsWith("image/")) {
        images.push({
          id: `gemini-${candidateIndex}-${partIndex}`,
          url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        });
      }
    });
  });

  return images;
}
