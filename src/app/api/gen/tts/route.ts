"use server";

import { NextRequest, NextResponse } from "next/server";
import googleTTS from "google-tts-api";

type VoiceId = "zhTwFemale" | "zhCnFemale" | "enUsBright" | "enGbCalm";

const VOICE_MAP: Record<
  VoiceId,
  {
    label: string;
    lang: string;
    slow?: boolean;
    host?: string;
  }
> = {
  zhTwFemale: { label: "中文（台灣）", lang: "zh-TW" },
  zhCnFemale: { label: "中文（普通話）", lang: "zh-CN" },
  enUsBright: { label: "English (US)", lang: "en-US" },
  enGbCalm: { label: "English (UK)", lang: "en-GB", slow: true },
};

const MAX_CHARS = 5000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { text?: string; voiceId?: VoiceId } | null;
    if (!body || typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "缺少文字內容。" }, { status: 400 });
    }
    const text = body.text.trim();
    if (text.length > MAX_CHARS) {
      return NextResponse.json({ error: `文字長度不可超過 ${MAX_CHARS} 字元。` }, { status: 400 });
    }

    const voiceId = body.voiceId ?? "zhTwFemale";
    const voice = VOICE_MAP[voiceId];
    if (!voice) {
      return NextResponse.json({ error: "不支援的語音選項。" }, { status: 400 });
    }

    const segments = googleTTS.getAllAudioUrls(text, {
      lang: voice.lang,
      slow: voice.slow ?? false,
      host: voice.host ?? "https://translate.google.com",
      splitPunct: ",.?!",
    });

    const buffers: Buffer[] = [];
    for (const segment of segments) {
      const audioResponse = await fetch(segment.url);
      if (!audioResponse.ok) {
        throw new Error(`下載語音片段失敗：${audioResponse.status}`);
      }
      const arrayBuffer = await audioResponse.arrayBuffer();
      buffers.push(Buffer.from(arrayBuffer));
    }

    if (buffers.length === 0) {
      return NextResponse.json({ error: "無法產生語音，請稍後再試。" }, { status: 500 });
    }

    const merged = Buffer.concat(buffers);
    return new NextResponse(merged, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="tts.mp3"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("TTS generation failed", error);
    return NextResponse.json({ error: "語音生成失敗，請稍後再試。" }, { status: 500 });
  }
}

