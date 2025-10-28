import { NextRequest, NextResponse } from "next/server";
import { createUploads, deleteUpload, listUploads } from "./store";

export async function GET() {
  return NextResponse.json(listUploads());
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as {
      files?: Array<{
        name: string;
        type: string;
        size: number;
        dataUri?: string;
        meta?: Record<string, unknown>;
      }>;
    };

    if (!payload?.files?.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploads = createUploads(payload.files);
    return NextResponse.json({ uploads });
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    deleteUpload(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete upload", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
