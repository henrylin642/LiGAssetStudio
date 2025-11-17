"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";
import type { NanoGenerationSpec } from "@/types/generation";

interface GeneratedImage {
  id: string;
  url: string;
  prompt?: string;
}

const NANO_STYLES = [
  { value: "photography", label: "寫實攝影" },
  { value: "illustration", label: "插畫" },
  { value: "anime", label: "動畫風" },
  { value: "3d", label: "3D 渲染" },
  { value: "sketch", label: "線條速寫" },
] as const;

const NANO_ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 正方形" },
  { value: "3:4", label: "3:4 直幅" },
  { value: "4:3", label: "4:3 橫幅" },
  { value: "9:16", label: "9:16 直幅" },
  { value: "16:9", label: "16:9 橫幅" },
] as const;

type NanoStyle = (typeof NANO_STYLES)[number]["value"];
type NanoAspectRatio = (typeof NANO_ASPECT_RATIOS)[number]["value"];

const TTS_VOICES = [
  { id: "zhTwFemale", label: "中文（台灣）", description: "Google TTS 女聲" },
  { id: "zhCnFemale", label: "中文（普通話）", description: "Google TTS 女聲" },
  { id: "enUsBright", label: "English (US)", description: "Bright tone" },
  { id: "enGbCalm", label: "English (UK)", description: "Calm tone" },
];

type VoiceOption = (typeof TTS_VOICES)[number]["id"];

const OPTIONAL_SELECT_NONE = "none";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  spec?: NanoGenerationSpec;
};

type WorkflowJobResponse = {
  id: string;
  status: "pending" | "running" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  logs: Array<{ timestamp: string; message: string }>;
};

const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random()}`;

const CURRENT_USER_ID = "demo-user";

const DEFAULT_ASSISTANT_SPEC: NanoGenerationSpec = {
  mode: "text",
  prompt: "",
  negativePrompt: "",
  style: "photography",
  aspectRatio: "1:1",
  count: 1,
  referenceImages: [],
};

export default function GenPage() {
  const api = useApi();
  const [bgEngine, setBgEngine] = useState<"rembg" | "hair">("rembg");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);
  const [bgResultUrl, setBgResultUrl] = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);

  const [nanoPrompt, setNanoPrompt] = useState("");
  const [nanoNegativePrompt, setNanoNegativePrompt] = useState("");
  const [nanoStyle, setNanoStyle] = useState<NanoStyle>("photography");
  const [nanoAspectRatio, setNanoAspectRatio] = useState<NanoAspectRatio>("1:1");
  const [nanoImageCount, setNanoImageCount] = useState(1);
  const [nanoSeed, setNanoSeed] = useState("");
  const [nanoGuidance, setNanoGuidance] = useState(7.5);
  const [nanoImages, setNanoImages] = useState<GeneratedImage[]>([]);
  const [nanoProcessing, setNanoProcessing] = useState(false);
  const [nanoError, setNanoError] = useState<string | null>(null);
  const nanoPromptTooShort = nanoPrompt.trim().length < 4;
  const [nanoGalleryTags, setNanoGalleryTags] = useState("nano-banana");
  const [nanoSavingImageId, setNanoSavingImageId] = useState<string | null>(null);
  const [nanoSavedImageIds, setNanoSavedImageIds] = useState<Record<string, boolean>>({});
  const [nanoSaveMessage, setNanoSaveMessage] = useState<string | null>(null);
  const [nanoSaveError, setNanoSaveError] = useState<string | null>(null);

  const [ttsVoice, setTtsVoice] = useState<VoiceOption>("zhTwFemale");
  const [ttsText, setTtsText] = useState("");
  const [ttsProcessing, setTtsProcessing] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);

  const [assistantSpec, setAssistantSpec] = useState<NanoGenerationSpec>(DEFAULT_ASSISTANT_SPEC);
  const refreshQuota = useCallback(async () => {
    try {
      const response = await fetch(`/api/workflows/quota?userId=${CURRENT_USER_ID}`);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        quota: { dailyLimit: number; dailyUsed: number; monthlyLimit: number; monthlyUsed: number };
      };
      setQuota(payload.quota);
    } catch (error) {
      console.error("Load quota failed", error);
    }
  }, []);

  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      id: createId(),
      role: "assistant",
      content:
        "哈囉！我是你的 AI 創意夥伴，請描述想製作的素材或貼上參考網址，我會幫你整理成 Nano Banana 可用的參數。",
    },
  ]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantProcessing, setAssistantProcessing] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowJobResponse | null>(null);
  const [quota, setQuota] = useState<{ dailyLimit: number; dailyUsed: number; monthlyLimit: number; monthlyUsed: number } | null>(null);
  const [referenceUrlInput, setReferenceUrlInput] = useState("");
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const assistantSummary = useMemo(() => {
    const reversed = [...assistantMessages].reverse();
    return reversed.find((message) => message.role === "assistant")?.content ?? "";
  }, [assistantMessages]);

  async function sendAssistantMessage(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!assistantInput.trim()) return;
    setAssistantProcessing(true);
    setAssistantError(null);
    const newMessages = [...assistantMessages, { id: createId(), role: "user" as const, content: assistantInput.trim() }];
    setAssistantMessages(newMessages);
    setAssistantInput("");
    try {
      const response = await fetch("/api/gen/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "對話失敗");
      }
      const payload = (await response.json()) as { message: string; spec?: NanoGenerationSpec };
      setAssistantMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", content: payload.message, spec: payload.spec ?? undefined },
      ]);
      if (payload.spec) {
        setAssistantSpec(payload.spec);
      }
    } catch (error) {
      console.error("Assistant send failed", error);
      setAssistantError(error instanceof Error ? error.message : "對話失敗");
    } finally {
      setAssistantProcessing(false);
    }
  }

  async function handleCreateWorkflowFromAssistant() {
    try {
      if (!assistantSpec.prompt.trim()) {
        setAssistantError("請先完成主要描述，至少 20 個字。");
        return;
      }
      setAssistantError(null);
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: CURRENT_USER_ID,
          params: {
            conversation: assistantMessages,
            summary: assistantSummary,
            spec: assistantSpec,
          },
          credits: assistantSpec.count,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "無法建立工作");
      }
      const payload = (await response.json()) as { job: WorkflowJobResponse };
      setActiveWorkflow(payload.job);
    } catch (error) {
      console.error("Create workflow from assistant failed", error);
      setAssistantError(error instanceof Error ? error.message : "工作建立失敗");
    }
  }

  const handleSpecChange = <K extends keyof NanoGenerationSpec>(key: K, value: NanoGenerationSpec[K]) => {
    setAssistantSpec((prev) => ({ ...prev, [key]: value }));
  };

  const handleReferenceUrlAdd = () => {
    if (!referenceUrlInput.trim()) return;
    const value = referenceUrlInput.trim();
    setAssistantSpec((prev) => ({ ...prev, referenceImages: [...prev.referenceImages, value] }));
    setReferenceUrlInput("");
    setReferenceError(null);
  };

  const handleReferenceRemove = (url: string) => {
    setAssistantSpec((prev) => ({ ...prev, referenceImages: prev.referenceImages.filter((item) => item !== url) }));
  };

  async function handleReferenceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReferenceError(null);
    setReferenceUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/gen/reference", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "上傳失敗");
      }
      const payload = (await response.json()) as { url: string };
      setAssistantSpec((prev) => ({ ...prev, referenceImages: [...prev.referenceImages, payload.url] }));
    } catch (error) {
      console.error("Reference upload failed", error);
      setReferenceError(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setReferenceUploading(false);
      event.target.value = "";
    }
  }

  useEffect(() => {
    if (!activeWorkflow) return undefined;
    if (activeWorkflow.status === "succeeded" || activeWorkflow.status === "failed") {
      refreshQuota();
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/workflows?id=${activeWorkflow.id}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { job: WorkflowJobResponse };
        setActiveWorkflow(payload.job);
      } catch (error) {
        console.error("Workflow polling failed", error);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeWorkflow, refreshQuota]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

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
    const trimmedPrompt = nanoPrompt.trim();
    if (trimmedPrompt.length < 4) {
      setNanoError("請輸入至少 4 個字元的 prompt。");
      return;
    }
    setNanoProcessing(true);
    setNanoError(null);
    try {
      const seedValue = nanoSeed.trim();
      const seedNumber = seedValue ? Number(seedValue) : undefined;
      const body = {
        mode: "text",
        prompt: trimmedPrompt,
        negativePrompt: nanoNegativePrompt.trim() || undefined,
        style: nanoStyle,
        aspectRatio: nanoAspectRatio,
        count: nanoImageCount,
        guidance: nanoGuidance,
        seed: seedNumber !== undefined && !Number.isNaN(seedNumber) ? Math.round(seedNumber) : undefined,
      };
      const response = await fetch("/api/gen/nanobanana", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Nano Banana 生成失敗");
      }
      const payload = (await response.json()) as { images: Array<{ id: string; url: string; prompt?: string }> };
      if (!payload.images?.length) {
        setNanoError("Nano Banana 未回傳圖像，請稍後再試。");
      }
      setNanoImages(payload.images ?? []);
      setNanoSavedImageIds({});
      setNanoSaveMessage(null);
      setNanoSaveError(null);
    } catch (error) {
      console.error(error);
      setNanoError(error instanceof Error ? error.message : "生成失敗");
    } finally {
      setNanoProcessing(false);
    }
  }

  function parseTags(input: string) {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  async function handleNanoSaveToGallery(image: GeneratedImage) {
    setNanoSavingImageId(image.id);
    setNanoSaveError(null);
    setNanoSaveMessage(null);
    try {
      const tags = parseTags(nanoGalleryTags);
      const response = await api("/gen/nanobanana/import", {
        method: "POST",
        body: JSON.stringify({
          url: image.url.startsWith("data:") ? undefined : image.url,
          dataUrl: image.url.startsWith("data:") ? image.url : undefined,
          tags,
          prompt: image.prompt ?? nanoPrompt,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string })?.error ?? "儲存失敗");
      }

      setNanoSavedImageIds((previous) => ({ ...previous, [image.id]: true }));
      setNanoSaveMessage("已將圖片存入 Gallery，可至 / 檢視或進行批次操作。");
    } catch (error) {
      console.error("Save Nano Banana image failed", error);
      setNanoSaveError(error instanceof Error ? error.message : "儲存失敗，請稍後再試。");
    } finally {
      setNanoSavingImageId(null);
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

      <Tabs defaultValue="assistant" className="w-full">
        <TabsList className="grid w-full grid-cols-1 gap-2 sm:grid-cols-4">
          <TabsTrigger value="assistant">AI 對話</TabsTrigger>
          <TabsTrigger value="remove">圖片去背</TabsTrigger>
          <TabsTrigger value="nano">Nano Banana</TabsTrigger>
          <TabsTrigger value="tts">語音合成 (TTS)</TabsTrigger>
        </TabsList>

        <TabsContent value="assistant">
          <Card>
            <CardHeader>
              <CardTitle>AI 對話助手</CardTitle>
              <CardDescription>使用 Gemini 幫你整理 Nano Banana 需求，再一鍵建立產製工作。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="text-sm font-semibold text-slate-800">配額</p>
                {quota ? (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <p>
                      每日：{quota.dailyUsed} / {quota.dailyLimit} 張（剩餘 {Math.max(0, quota.dailyLimit - quota.dailyUsed)} 張）
                    </p>
                    <p>
                      每月：{quota.monthlyUsed} / {quota.monthlyLimit} 張（剩餘{" "}
                      {Math.max(0, quota.monthlyLimit - quota.monthlyUsed)} 張）
                    </p>
                  </div>
                ) : (
                  <p>載入配額中…</p>
                )}
              </div>
              <div className="h-64 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="space-y-3">
                  {assistantMessages.map((message) => (
                    <div key={message.id}>
                      <p className="text-xs font-semibold text-slate-500">{message.role === "user" ? "你" : "AI"}</p>
                      <p className="whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-slate-700 shadow-sm">
                        {message.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              {assistantError ? <p className="text-xs text-red-600">{assistantError}</p> : null}
              <form className="space-y-2" onSubmit={sendAssistantMessage}>
                <Label htmlFor="assistant-input">輸入訊息</Label>
                <Textarea
                  id="assistant-input"
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  rows={3}
                  placeholder="描述想要的場景、風格或用途，AI 會幫你整理成可用參數。"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={assistantProcessing || !assistantInput.trim()}>
                    {assistantProcessing ? "傳送中…" : "傳送訊息"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAssistantMessages((messages) => messages.slice(0, 1))}>
                    清除對話
                  </Button>
                </div>
              </form>
              <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">參數摘要</p>
                    <p className="text-xs text-slate-500">可依需求調整，建立工作時會以此為準。</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="assistant-spec-mode">模式</Label>
                    <Select value={assistantSpec.mode} onValueChange={(value) => handleSpecChange("mode", value as NanoGenerationSpec["mode"])}>
                      <SelectTrigger id="assistant-spec-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text to Image</SelectItem>
                        <SelectItem value="image">Image to Image</SelectItem>
                        <SelectItem value="remix">Remix / Blend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assistant-spec-count">輸出張數</Label>
                    <Input
                      id="assistant-spec-count"
                      type="number"
                      min={1}
                      max={4}
                      value={assistantSpec.count}
                      onChange={(event) => handleSpecChange("count", Math.min(Math.max(Number(event.target.value) || 1, 1), 4))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="assistant-spec-prompt">主要描述</Label>
                    <Textarea
                      id="assistant-spec-prompt"
                      rows={4}
                      value={assistantSpec.prompt}
                      onChange={(event) => handleSpecChange("prompt", event.target.value)}
                      placeholder="請輸入至少 20 個字，描述場景、人物、風格等"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assistant-spec-negative">Negative Prompt</Label>
                    <Textarea
                      id="assistant-spec-negative"
                      rows={3}
                      value={assistantSpec.negativePrompt ?? ""}
                      onChange={(event) => handleSpecChange("negativePrompt", event.target.value)}
                      placeholder="不要出現的元素…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assistant-spec-style">風格</Label>
                    <Select
                      value={assistantSpec.style ?? OPTIONAL_SELECT_NONE}
                      onValueChange={(value) =>
                        handleSpecChange("style", value === OPTIONAL_SELECT_NONE ? undefined : (value as string))
                      }
                    >
                      <SelectTrigger id="assistant-spec-style">
                        <SelectValue placeholder="選擇風格" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OPTIONAL_SELECT_NONE}>無</SelectItem>
                        {NANO_STYLES.map((style) => (
                          <SelectItem key={style.value} value={style.value}>
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assistant-spec-aspect">畫面比例</Label>
                    <Select
                      value={assistantSpec.aspectRatio ?? OPTIONAL_SELECT_NONE}
                      onValueChange={(value) =>
                        handleSpecChange("aspectRatio", value === OPTIONAL_SELECT_NONE ? undefined : (value as string))
                      }
                    >
                      <SelectTrigger id="assistant-spec-aspect">
                        <SelectValue placeholder="選擇比例" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OPTIONAL_SELECT_NONE}>自動</SelectItem>
                        {NANO_ASPECT_RATIOS.map((ratio) => (
                          <SelectItem key={ratio.value} value={ratio.value}>
                            {ratio.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>參考圖片</Label>
                  {assistantSpec.referenceImages.length ? (
                    <ul className="space-y-2 text-xs">
                      {assistantSpec.referenceImages.map((url) => (
                        <li key={url} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1">
                          <span className="truncate">{url}</span>
                          <Button size="sm" variant="ghost" onClick={() => handleReferenceRemove(url)}>
                            移除
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">尚未加入參考圖。</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="flex-1"
                      value={referenceUrlInput}
                      onChange={(event) => setReferenceUrlInput(event.target.value)}
                      placeholder="貼上圖片 URL"
                    />
                    <Button type="button" variant="outline" onClick={handleReferenceUrlAdd} disabled={!referenceUrlInput.trim()}>
                      新增
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Label className="text-xs">或上傳圖片</Label>
                    <Input type="file" accept="image/*" onChange={handleReferenceUpload} disabled={referenceUploading} />
                    {referenceUploading ? <span>上傳中…</span> : null}
                  </div>
                  {referenceError ? <p className="text-xs text-red-600">{referenceError}</p> : null}
                </div>
                <div className="rounded-md bg-slate-900/90 p-3 text-xs text-slate-100">
                  <pre className="whitespace-pre-wrap">{JSON.stringify(assistantSpec, null, 2)}</pre>
                </div>
              </div>
              <div className="space-y-2 rounded-md border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">快速建立產製工作</p>
                    <p className="text-xs text-slate-500">會把目前對話摘要、參數送進 Workflow 佇列。</p>
                  </div>
                  <Button onClick={handleCreateWorkflowFromAssistant} disabled={assistantProcessing}>
                    建立工作
                  </Button>
                </div>
                {activeWorkflow ? (
                  <div className="space-y-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                    <p>
                      工作 ID：<span className="font-mono text-slate-800">{activeWorkflow.id}</span>
                    </p>
                    <p>狀態：{activeWorkflow.status}</p>
                    <div className="space-y-1">
                      <p className="font-semibold">Logs</p>
                      <ul className="list-disc space-y-1 pl-4">
                        {activeWorkflow.logs.map((log) => (
                          <li key={`${activeWorkflow.id}-${log.timestamp}`}>
                            <span className="font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span> - {log.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
              <CardTitle>Nano Banana 文生圖</CardTitle>
              <CardDescription>輸入 Prompt、風格與輸出張數，透過 Nano Banana API 生成主視覺。後續可延伸到圖生 3D 工作流。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleNanoSubmit}>
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
                  <p className="text-xs text-slate-500">描述越具體、包含視覺風格與構圖元素，成圖越可控。</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nano-negative">Negative Prompt（可選）</Label>
                  <Textarea
                    id="nano-negative"
                    rows={2}
                    value={nanoNegativePrompt}
                    onChange={(event) => setNanoNegativePrompt(event.target.value)}
                    placeholder="Describe what you do NOT want to see, e.g. text, watermark, low quality"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nano-tags">存入 Gallery 的 Tags（逗號分隔，可留空）</Label>
                  <Input
                    id="nano-tags"
                    value={nanoGalleryTags}
                    onChange={(event) => setNanoGalleryTags(event.target.value)}
                    placeholder="nano-banana,classroom"
                  />
                  <p className="text-xs text-slate-500">用逗號分隔，方便在 Gallery 搜尋或做批次處理。</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="nano-style">風格</Label>
                    <Select value={nanoStyle} onValueChange={(value) => setNanoStyle(value as NanoStyle)}>
                      <SelectTrigger id="nano-style">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NANO_STYLES.map((style) => (
                          <SelectItem key={style.value} value={style.value}>
                            {style.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nano-aspect">畫面比例</Label>
                    <Select value={nanoAspectRatio} onValueChange={(value) => setNanoAspectRatio(value as NanoAspectRatio)}>
                      <SelectTrigger id="nano-aspect">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NANO_ASPECT_RATIOS.map((ratio) => (
                          <SelectItem key={ratio.value} value={ratio.value}>
                            {ratio.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="nano-count">輸出張數 (1-4)</Label>
                    <Input
                      id="nano-count"
                      type="number"
                      min={1}
                      max={4}
                      value={nanoImageCount}
                      onChange={(event) => {
                        const parsed = Math.round(Number(event.target.value) || 1);
                        setNanoImageCount(Math.min(Math.max(parsed, 1), 4));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nano-guidance">引導強度 (CFG)</Label>
                    <Input
                      id="nano-guidance"
                      type="number"
                      min={0}
                      max={20}
                      step={0.5}
                      value={nanoGuidance}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isNaN(value)) {
                          setNanoGuidance(0);
                          return;
                        }
                        setNanoGuidance(Math.min(Math.max(value, 0), 20));
                      }}
                    />
                    <p className="text-xs text-slate-500">值越高越貼近 prompt，但也較容易產生細節噪點。</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nano-seed">Seed（可選）</Label>
                    <Input
                      id="nano-seed"
                      value={nanoSeed}
                      onChange={(event) => setNanoSeed(event.target.value)}
                      placeholder="留空採隨機"
                    />
                  </div>
                </div>

                {nanoError ? <p className="text-xs text-red-600">{nanoError}</p> : null}
                {nanoSaveError ? <p className="text-xs text-red-600">{nanoSaveError}</p> : null}
                {nanoSaveMessage ? <p className="text-xs text-green-600">{nanoSaveMessage}</p> : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={nanoProcessing || nanoPromptTooShort}>
                    {nanoProcessing ? "生成中…" : "送出生成"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!nanoImages.length || nanoProcessing}
                    onClick={() => setNanoImages([])}
                  >
                    清除結果
                  </Button>
                </div>
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
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleNanoSaveToGallery(image)}
                          disabled={nanoSavingImageId === image.id}
                        >
                          {nanoSavingImageId === image.id
                            ? "儲存中…"
                            : nanoSavedImageIds[image.id]
                              ? "已存入 Gallery"
                              : "存入 Gallery"}
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <a href={image.url} download>
                            下載
                          </a>
                        </Button>
                      </div>
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
