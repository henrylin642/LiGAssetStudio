import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import path from "path";
import os from "os";

const REMBG_CLI = process.env.REMBG_CLI ?? "rembg";
const HAIR_SERVICE_URL = process.env.HAIR_SERVICE_URL;

export const runtime = "nodejs";

async function runBackgroundRemoval(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    const args = ["i", inputPath, outputPath];
    const child = spawn(REMBG_CLI, args, { stdio: "inherit" });
    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`rembg exited with code ${code}`));
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const engine = (formData.get("engine") as string) ?? "rembg";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "assets-studio-bg-"));
    const inputPath = path.join(tmpDir, file.name || "input.png");
    const outputPath = path.join(tmpDir, `${path.parse(file.name || "output").name}-removed.png`);

    await fs.writeFile(inputPath, buffer);

    let outputBuffer: Buffer | null = null;

    if (engine === "hair") {
      if (!HAIR_SERVICE_URL) {
        await fs.rm(tmpDir, { recursive: true, force: true });
        return NextResponse.json(
          { error: "hair 服務尚未設定，請配置 HAIR_SERVICE_URL" },
          { status: 501 },
        );
      }
      const blob = new Blob([buffer], { type: file.type || "image/png" });
      const forwardForm = new FormData();
      forwardForm.append("file", blob, file.name || "input.png");

      const hairResponse = await fetch(HAIR_SERVICE_URL, {
        method: "POST",
        body: forwardForm,
      });

      if (!hairResponse.ok) {
        const message = await hairResponse.json().catch(() => ({}));
        throw new Error(message?.error ?? `hair service error (${hairResponse.status})`);
      }

      const arrayBuf = await hairResponse.arrayBuffer();
      outputBuffer = Buffer.from(arrayBuf);
    } else {
      await runBackgroundRemoval(inputPath, outputPath);
      outputBuffer = await fs.readFile(outputPath);
    }

    await fs.rm(tmpDir, { recursive: true, force: true });

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "attachment; filename=removed-background.png",
      },
    });
  } catch (error) {
    console.error("Background removal failed", error);
    return NextResponse.json({ error: "背景去除失敗，請確認 REMBG 服務是否可用" }, { status: 500 });
  }
}
