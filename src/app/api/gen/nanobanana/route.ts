import { NextRequest, NextResponse } from "next/server";

const BASE_URL = process.env.NANO_BANANA_BASE_URL;
const API_KEY = process.env.NANO_BANANA_API_KEY;

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const mode = (formData.get("mode") as string) ?? "text";
    const prompt = (formData.get("prompt") as string) ?? "";
    const strength = Number(formData.get("strength") ?? 0.6);

    const imageA = formData.get("imageA");
    const imageB = formData.get("imageB");

    const encodeFile = async (file: FormDataEntryValue | null) => {
      if (!file || !(file instanceof File)) return undefined;
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      return `data:${file.type};base64,${base64}`;
    };

    const imageAData = await encodeFile(imageA);
    const imageBData = await encodeFile(imageB);

    if (!BASE_URL || !API_KEY) {
      return NextResponse.json(
        {
          error: "Nano Banana API 尚未設定，請配置 NANO_BANANA_BASE_URL 與 NANO_BANANA_API_KEY 環境變數。",
          images: [],
        },
        { status: 501 },
      );
    }

    const payload = {
      mode,
      prompt,
      strength,
      imageA: imageAData,
      imageB: imageBData,
    };

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
      throw new Error(message?.error ?? `Nano Banana API error (${response.status})`);
    }

    const json = (await response.json()) as {
      images?: Array<{ id?: string; base64?: string; url?: string; prompt?: string }>;
    };

    const images = (json.images ?? [])
      .map((image, index) => {
        if (image.url) {
          return { id: image.id ?? `remote-${index}`, url: image.url, prompt: image.prompt ?? prompt };
        }
        if (image.base64) {
          return {
            id: image.id ?? `remote-${index}`,
            url: `data:image/png;base64,${image.base64}`,
            prompt: image.prompt ?? prompt,
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{ id: string; url: string; prompt?: string }>;

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Nano Banana API failure", error);
    return NextResponse.json({ error: "Nano Banana 生成失敗" }, { status: 500 });
  }
}
