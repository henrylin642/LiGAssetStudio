import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, forwardJson, ligFetch } from "../../../_lib/lig-client";

function sanitizeExtension(ext?: string | null) {
  if (!ext) return "png";
  const normalized = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return "png";
  return normalized;
}

function dataUrlToBase64(dataUrl: string) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) return null;
  return parts.pop() ?? null;
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    url?: string;
    dataUrl?: string;
    tags?: string[];
    prompt?: string;
    filename?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body || (typeof body.url !== "string" && typeof body.dataUrl !== "string")) {
    return NextResponse.json({ error: "缺少圖片來源 URL" }, { status: 400 });
  }

  let base64Data: string | null = null;
  let extension: string | undefined;

  if (body.dataUrl) {
    base64Data = dataUrlToBase64(body.dataUrl);
    const match = body.dataUrl.match(/data:image\/([^;]+);base64/i);
    extension = sanitizeExtension(match?.[1]);
  }

  if (!base64Data && body.url) {
    try {
      const response = await fetch(body.url);
      if (!response.ok) {
        return NextResponse.json({ error: `無法下載圖片 (${response.status})` }, { status: 502 });
      }
      const contentType = response.headers.get("content-type");
      if (contentType?.startsWith("image/")) {
        extension = sanitizeExtension(contentType.split("/").pop());
      }
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      if (!extension && body.url.includes(".")) {
        extension = sanitizeExtension(body.url.split("?")[0].split(".").pop());
      }
    } catch (error) {
      console.error("Failed to download Nano Banana image", error);
      return NextResponse.json({ error: "下載圖片失敗，請稍後再試。" }, { status: 502 });
    }
  }

  if (!base64Data) {
    return NextResponse.json({ error: "無法解析圖片內容" }, { status: 400 });
  }

  const tags = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : ["nano-banana"];
  const filename =
    body.filename && body.filename.trim().length > 0
      ? body.filename.trim()
      : `nano-banana-${Date.now()}.${extension ?? "png"}`;

  const payload = {
    assets: [
      {
        data: base64Data,
        ext: extension ?? "png",
        filename,
        tags,
        meta: {
          source: "nano-banana",
          prompt: body.prompt ?? "",
        },
      },
    ],
  };

  const upstream = await ligFetch(
    "/api/v1/assets",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamBody = await forwardJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(upstreamBody ?? { error: "新增資產失敗" }, { status: upstream.status });
  }

  return NextResponse.json(upstreamBody ?? { ok: true }, { status: upstream.status });
}
