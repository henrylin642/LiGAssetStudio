"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";

interface GeneratedImage {
  id: string;
  url: string;
  prompt?: string;
}

const TTS_VOICES = [
  { id: "zhTwFemale", label: "中文（台灣）", description: "Google TTS 女聲" },
  { id: "zhCnFemale", label: "中文（普通話）", description: "Google TTS 女聲" },
  { id: "enUsBright", label: "English (US)", description: "Bright tone" },
  { id: "enGbCalm", label: "English (UK)", description: "Calm tone" },
];

type VoiceOption = (typeof TTS_VOICES)[number]["id"];

export default function GenPage() {
  const [bgEngine, setBgEngine] = useState<"rembg" | "hair">("rembg");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [bgResultUrl, setBgResultUrl] = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);

  const [nanoMode, setNanoMode] = useState<"text" | "image" | "image-mix">("text");
  const [nanoPrompt, setNanoPrompt] = useState("");
  const [nanoStrength, setNanoStrength] = useState(0.6);
  const [nanoImageA, setNanoImageA] = useState<File | null>(null);
  const [nanoImageB, setNanoImageB] = useState<File | null>(null);
  const [nanoImages, setNanoImages] = useState<GeneratedImage[]>([]);
  const [nanoProcessing, setNanoProcessing] = useState(false);
  const [nanoError, setNanoError] = useState<string | null>(null);

  const [ttsVoice, setTtsVoice] = useState<VoiceOption>("zhTwFemale");
  const [ttsText, setTtsText] = useState("");
  const [ttsProcessing, setTtsProcessing] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (ttsAudioUrl) {
        URL.revokeObjectURL(ttsAudioUrl);
      }
    };
  }, [ttsAudioUrl]);

  async function handleBackgroundSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bgFile) {
      setBgError("請先選擇一張圖片。");
      return;
    }
    setBgProcessing(true);
    setBgError(null);
    setBgResultUrl(null);
    try {
      const formData = new FormData();
      formData.append("file", bgFile);
      formData.append("engine", bgEngine);
      const response = await fetch("/api/gen/background/remove", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message?.error ?? "背景去除失敗");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setBgResultUrl(url);
    } catch (error) {
      console.error(error);
      setBgError(error instanceof Error ? error.message : "發生未知錯誤");
    } finally {
      setBgProcessing(false);
    }
  }

  async function handleNanoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNanoProcessing(true);
    setNanoError(null);
    try {
      const formData = new FormData();
      formData.append("mode", nanoMode);
      formData.append("prompt", nanoPrompt);
      formData.append("strength", String(nanoStrength));
      if (nanoImageA) formData.append("imageA", nanoImageA);
      if (nanoImageB) formData.append("imageB", nanoImageB);

      const response = await fetch("/api/gen/nanobanana", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Nano Banana 生成失敗");
      }
      const payload = (await response.json()) as { images: Array<{ id: string; url: string; prompt?: string }> };
      setNanoImages(payload.images ?? []);
    } catch (error) {
      console.error(error);
      setNanoError(error instanceof Error ? error.message : "生成失敗");
    } finally {
      setNanoProcessing(false);
    }
  }

  async function handleTtsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ttsText.trim()) {
      setTtsError("請先輸入要轉換的文字。");
      return;
    }
    setTtsProcessing(true);
    setTtsError(null);
    if (ttsAudioUrl) {
      URL.revokeObjectURL(ttsAudioUrl);
      setTtsAudioUrl(null);
    }
    try {
      const response = await fetch("/api/gen/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: ttsText,
          voiceId: ttsVoice,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string })?.error ?? "語音生成失敗");
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      setTtsAudioUrl(url);
    } catch (error) {
      console.error(error);
      setTtsError(error instanceof Error ? error.message : "語音生成失敗");
    } finally {
      setTtsProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">生成工作台</h1>
        <p className="text-sm text-slate-500">
          圖片去背與 Nano Banana 圖像生成整合於單一介面。後端路由提供可自建服務接點，方便在正式環境部署。
        </p>
      </div>

      <Tabs defaultValue="remove" className="w-full">
        <TabsList className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="remove">圖片去背</TabsTrigger>
          <TabsTrigger value="nano">Nano Banana</TabsTrigger>
          <TabsTrigger value="tts">語音合成 (TTS)</TabsTrigger>
        </TabsList>

        <TabsContent value="remove">
          <Card>
            <CardHeader>
              <CardTitle>圖片去背</CardTitle>
              <CardDescription>可切換一般場景（rembg）或人物髮絲優化（hair）服務，輸出透明背景 PNG。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleBackgroundSubmit}>
                <div className="space-y-2">
                  <Label>去背引擎</Label>
                  <Select value={bgEngine} onValueChange={(value) => setBgEngine(value as typeof bgEngine)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rembg">rembg（通用物件）</SelectItem>
                      <SelectItem value="hair">hair（人物髮絲）</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    hair 引擎需部署對應服務並設定 <code className="rounded bg-slate-100 px-1">HAIR_SERVICE_URL</code>。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bg-file">選擇圖片</Label>
                  <Input
                    id="bg-file"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
                      if (bgResultUrl) URL.revokeObjectURL(bgResultUrl);
                      setBgFile(file ?? null);
                      setBgResultUrl(null);
                      setBgError(null);
                      if (file) {
                        setBgPreviewUrl(URL.createObjectURL(file));
                      } else {
                        setBgPreviewUrl(null);
                      }
                    }}
                  />
                  {bgFile ? (
                    <p className="text-xs text-slate-500">
                      {bgFile.name} • {formatBytes(bgFile.size)}
                    </p>
                  ) : null}
                </div>

                {bgPreviewUrl ? (
                  <div className="flex flex-wrap gap-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500">原始圖片</p>
                      <Image
                        src={bgPreviewUrl}
                        alt="原始預覽"
                        width={260}
                        height={260}
                        className="rounded-md border"
                      />
                    </div>
                    {bgResultUrl ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500">去背結果</p>
                        <Image
                          src={bgResultUrl}
                          alt="去背圖片"
                          width={260}
                          height={260}
                          className="rounded-md border bg-white"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {bgError ? <p className="text-xs text-red-600">{bgError}</p> : null}

                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={!bgFile || bgProcessing}>
                    {bgProcessing ? "處理中…" : "去背並下載"}
                  </Button>
                  {bgResultUrl ? (
                    <Button asChild variant="outline">
                      <a href={bgResultUrl} download="removed-background.png">
                        下載 PNG
                      </a>
                    </Button>
                  ) : null}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tts">
          <Card>
            <CardHeader>
              <CardTitle>文字轉語音 (TTS)</CardTitle>
              <CardDescription>
                透過開源 <code className="rounded bg-slate-100 px-1">google-tts-api</code> 封裝的語音服務，快速輸出中英文 MP3 語音檔。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleTtsSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="tts-voice">語音</Label>
                  <Select value={ttsVoice} onValueChange={(value) => setTtsVoice(value as VoiceOption)}>
                    <SelectTrigger id="tts-voice" className="w-full sm:w-72">
                      <SelectValue placeholder="選擇語音" />
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <span className="font-medium text-slate-700">{voice.label}</span>
                          {voice.description ? <span className="ml-2 text-xs text-slate-500">{voice.description}</span> : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-text">輸入要朗讀的文字</Label>
                  <Textarea
                    id="tts-text"
                    value={ttsText}
                    onChange={(event) => setTtsText(event.target.value)}
                    placeholder="請輸入欲轉換為語音的內容，支援中英文混合。"
                    className="min-h-[160px]"
                    maxLength={5000}
                  />
                  <div className="flex flex-wrap items-center justify-between text-xs text-slate-500">
                    <span>支援最多 5,000 字元</span>
                    <span>{ttsText.length} / 5000</span>
                  </div>
                </div>

                {ttsError ? <p className="text-xs text-red-600">{ttsError}</p> : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={ttsProcessing}>
                    {ttsProcessing ? "生成中…" : "生成語音"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={ttsProcessing}
                    onClick={() => setTtsText("歡迎使用資訊球 TTS 功能，這裡可以快速將文字轉成語音。")}
                  >
                    範例（中文）
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={ttsProcessing}
                    onClick={() => setTtsText("Hello! This is a sample generated voice from the Asset Studio TTS feature.")}
                  >
                    Sample (English)
                  </Button>
                </div>

                {ttsAudioUrl ? (
                  <div className="space-y-2 rounded-md border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-700">預覽</p>
                    <audio controls src={ttsAudioUrl} className="w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" asChild>
                        <a href={ttsAudioUrl} download="tts-output.mp3">
                          下載 MP3
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          if (ttsAudioUrl) {
                            URL.revokeObjectURL(ttsAudioUrl);
                            setTtsAudioUrl(null);
                          }
                        }}
                      >
                        清除預覽
                      </Button>
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-slate-500">
                  若需更多聲線，可參考 <a href="https://github.com/zlargon/google-tts" target="_blank" rel="noreferrer" className="underline">google-tts-api</a>
                  提供的參數自訂語速與語系，或替換為自架的 TTS 服務。
                </p>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nano">
          <Card>
            <CardHeader>
              <CardTitle>Nano Banana 圖像生成</CardTitle>
              <CardDescription>支援純文字、圖像＋文字、雙圖合成等模式。需在環境變數設定 Nano Banana API。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleNanoSubmit}>
                <div className="space-y-1">
                  <Label>模式</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={nanoMode === "text" ? "default" : "outline"}
                      onClick={() => setNanoMode("text")}
                    >
                      Prompt → Image
                    </Button>
                    <Button
                      type="button"
                      variant={nanoMode === "image" ? "default" : "outline"}
                      onClick={() => setNanoMode("image")}
                    >
                      Image + Prompt
                    </Button>
                    <Button
                      type="button"
                      variant={nanoMode === "image-mix" ? "default" : "outline"}
                      onClick={() => setNanoMode("image-mix")}
                    >
                      Image + Image + Prompt
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nano-prompt">Prompt</Label>
                  <Textarea
                    id="nano-prompt"
                    value={nanoPrompt}
                    onChange={(event) => setNanoPrompt(event.target.value)}
                    minLength={4}
                    rows={4}
                    placeholder="Describe the scene, style, lighting..."
                  />
                </div>

                {nanoMode !== "text" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nano-image-a">參考圖片 A</Label>
                      <Input
                        id="nano-image-a"
                        type="file"
                        accept="image/*"
                        onChange={(event) => setNanoImageA(event.target.files?.[0] ?? null)}
                      />
                    </div>
                    {nanoMode === "image-mix" ? (
                      <div className="space-y-2">
                        <Label htmlFor="nano-image-b">參考圖片 B</Label>
                        <Input
                          id="nano-image-b"
                          type="file"
                          accept="image/*"
                          onChange={(event) => setNanoImageB(event.target.files?.[0] ?? null)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <Label htmlFor="nano-strength">強度 (0-1)</Label>
                  <Input
                    id="nano-strength"
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={nanoStrength}
                    onChange={(event) => setNanoStrength(Number(event.target.value))}
                  />
                  <p className="text-xs text-slate-500">
                    Image-to-image 模式會套用 strength；值越接近 1 越貼近原圖。
                  </p>
                </div>

                {nanoError ? <p className="text-xs text-red-600">{nanoError}</p> : null}

                <Button type="submit" disabled={nanoProcessing || nanoPrompt.length < 4}>
                  {nanoProcessing ? "生成中…" : "送出生成"}
                </Button>
              </form>

              {nanoImages.length ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {nanoImages.map((image) => (
                    <div key={image.id} className="space-y-2 rounded-md border border-slate-200 p-3">
                      <div className="relative aspect-square overflow-hidden rounded-md bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={image.prompt ?? "nano banana result"} className="h-full w-full object-cover" />
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-3">{image.prompt ?? nanoPrompt}</p>
                      <Button asChild size="sm" variant="outline">
                        <a href={image.url} download>
                          下載
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
