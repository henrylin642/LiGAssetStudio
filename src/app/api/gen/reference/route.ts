import { NextRequest, NextResponse } from "next/server";
import { saveReferenceAsset } from "@/lib/reference-store";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "缺少檔案" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const asset = saveReferenceAsset({ filename: file.name, mimeType: file.type || "application/octet-stream", data: base64 });

    return NextResponse.json({
      id: asset.id,
      url: `/api/gen/reference/${asset.id}`,
      filename: asset.filename,
    });
  } catch (error) {
    console.error("Reference upload failed", error);
    return NextResponse.json({ error: "上傳參考圖失敗" }, { status: 500 });
  }
}
