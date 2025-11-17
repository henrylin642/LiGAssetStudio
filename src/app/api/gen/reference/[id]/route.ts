import { NextRequest, NextResponse } from "next/server";
import { getReferenceAsset } from "@/lib/reference-store";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const asset = getReferenceAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  }
  const data = Buffer.from(asset.data, "base64");
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
