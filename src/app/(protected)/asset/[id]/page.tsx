"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScenePicker } from "@/components/scene-picker";
import { ErrorBanner } from "@/components/error-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetQuery } from "@/hooks/use-asset";
import { useScenesQuery } from "@/hooks/use-scenes";
import { useCreateJobMutation } from "@/hooks/use-jobs";
import { useApi } from "@/hooks/use-api";
import type { DownscaleOptions, FFmpegOptions } from "@/types/dto";
import { formatBytes } from "@/lib/utils";
import { PreviewImage } from "@/components/preview/preview-image";
import { PreviewVideo } from "@/components/preview/preview-video";
import { Preview3D } from "@/components/preview/preview-3d";

function AssetPreview({
  type,
  url,
  previewUrl,
  name,
  onImageDimensions,
}: {
  type: string;
  url: string;
  previewUrl?: string;
  name: string;
  onImageDimensions?: (dimensions: { width: number; height: number }) => void;
}) {
  if (type === "image") {
    return (
      <PreviewImage
        src={previewUrl ?? url}
        alt={name}
        variant="detail"
        maxSize={720}
        onDimensions={onImageDimensions}
      />
    );
  }
  if (type === "video") {
    return <PreviewVideo src={url} poster={previewUrl} />;
  }
  return <Preview3D src={url} poster={previewUrl} variant="detail" />;
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const assetId = params?.id;
  const api = useApi();
  const scenesQuery = useScenesQuery();
  const assetQuery = useAssetQuery(assetId ?? "");
  const createJob = useCreateJobMutation();

  const [downscale, setDownscale] = useState<DownscaleOptions>({
    target: "image",
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 80,
    keepAspectRatio: true,
    outputFormat: "jpg",
  });
  const [ffmpeg, setFfmpeg] = useState<FFmpegOptions>({
    mode: "targetCRF",
    targetFormat: "mp4",
    crf: 23,
    audioCopy: true,
    fastStart: true,
  });
  const [sceneId, setSceneId] = useState<number>();
  const [sceneName, setSceneName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageResolution, setImageResolution] = useState<{ width: number; height: number } | null>(null);

  const asset = assetQuery.data;

  useEffect(() => {
    setImageResolution(null);
  }, [asset?.id]);

  const metaEntries = useMemo(() => {
    if (!asset?.meta) return [];
    return Object.entries(asset.meta);
  }, [asset?.meta]);

  if (!assetId) {
    return <ErrorBanner message="Asset id is missing" />;
  }

  async function submitDownscale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    await createJob.mutateAsync({
      kind: "downscale",
      assetIds: [asset.id],
      options: downscale,
    });
  }

  async function submitFfmpeg(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;
    await createJob.mutateAsync({
      kind: "ffmpeg",
      assetIds: [asset.id],
      options: ffmpeg,
    });
  }

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || !sceneId || !sceneName) return;
    setUploading(true);
    try {
      await api("/scenes/upload-from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId: asset.id, sceneId, name: sceneName }),
      });
      setSceneName("");
      setSceneId(undefined);
    } finally {
      setUploading(false);
    }
  }

  if (assetQuery.isError) {
    return <ErrorBanner message={assetQuery.error?.message ?? "Failed to load asset"} />;
  }

  if (!asset) {
    return <div className="text-sm text-slate-500">Loading asset…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <AssetPreview
            type={asset.type}
            url={asset.url}
            previewUrl={asset.previewUrl}
            name={asset.name}
            onImageDimensions={(dimensions) => setImageResolution(dimensions)}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{asset.name}</CardTitle>
              <CardDescription>{asset.url}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{asset.type.toUpperCase()}</Badge>
                {asset.ext ? <Badge variant="outline">.{asset.ext}</Badge> : null}
              </div>
              <div className="text-slate-600">Size: {formatBytes(asset.size)}</div>
              {asset.type === "image" && imageResolution ? (
                <div className="text-slate-600">
                  Resolution: {imageResolution.width} × {imageResolution.height}px
                </div>
              ) : null}
              {metaEntries.length ? (
                <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Metadata</summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {metaEntries.map(([key, value]) => (
                      <li key={key}>
                        <span className="font-semibold">{key}:</span> {JSON.stringify(value)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="w-full">
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload to Scene</CardTitle>
                  <CardDescription>Create AR object from this asset.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={submitUpload}>
                    <div className="space-y-1">
                      <Label>Scene</Label>
                      <ScenePicker
                        scenes={scenesQuery.data ?? []}
                        value={sceneId}
                        onChange={setSceneId}
                        placeholder={scenesQuery.isLoading ? "Loading scenes…" : "Select scene"}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sceneName">Name</Label>
                      <Input
                        id="sceneName"
                        value={sceneName}
                        onChange={(event) => setSceneName(event.target.value)}
                        placeholder={asset.name}
                      />
                    </div>
                    <Button type="submit" disabled={!sceneId || !sceneName || uploading}>
                      {uploading ? "Uploading…" : "Upload"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="tools" className="mt-4 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Downscale</CardTitle>
                  <CardDescription>Generate resized images through adapter jobs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={submitDownscale}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="dsWidth">Max width</Label>
                        <Input
                          id="dsWidth"
                          type="number"
                          value={downscale.maxWidth ?? ""}
                          onChange={(event) =>
                            setDownscale((prev) => ({ ...prev, maxWidth: Number(event.target.value) }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="dsHeight">Max height</Label>
                        <Input
                          id="dsHeight"
                          type="number"
                          value={downscale.maxHeight ?? ""}
                          onChange={(event) =>
                            setDownscale((prev) => ({ ...prev, maxHeight: Number(event.target.value) }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dsQuality">Quality</Label>
                      <Input
                        id="dsQuality"
                        type="number"
                        value={downscale.quality ?? ""}
                        onChange={(event) =>
                          setDownscale((prev) => ({ ...prev, quality: Number(event.target.value) }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dsFormat">Output format</Label>
                      <Input
                        id="dsFormat"
                        value={downscale.outputFormat ?? ""}
                        onChange={(event) =>
                          setDownscale((prev) => ({
                            ...prev,
                            outputFormat: event.target.value as DownscaleOptions["outputFormat"],
                          }))
                        }
                      />
                    </div>
                    <Button type="submit" disabled={createJob.isPending}>
                      {createJob.isPending ? "Submitting…" : "Create downscale job"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>FFmpeg</CardTitle>
                  <CardDescription>Run FFmpeg presets on this video asset.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-3" onSubmit={submitFfmpeg}>
                    <div className="space-y-1">
                      <Label htmlFor="ffMode">Mode</Label>
                      <Input
                        id="ffMode"
                        value={ffmpeg.mode}
                        onChange={(event) =>
                          setFfmpeg((prev) => ({ ...prev, mode: event.target.value as FFmpegOptions["mode"] }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="ffCrf">CRF</Label>
                        <Input
                          id="ffCrf"
                          type="number"
                          value={ffmpeg.crf ?? ""}
                          onChange={(event) => setFfmpeg((prev) => ({ ...prev, crf: Number(event.target.value) }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ffBitrate">Bitrate (kbps)</Label>
                        <Input
                          id="ffBitrate"
                          type="number"
                          value={ffmpeg.bitrateKbps ?? ""}
                          onChange={(event) =>
                            setFfmpeg((prev) => ({ ...prev, bitrateKbps: Number(event.target.value) }))
                          }
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={createJob.isPending}>
                      {createJob.isPending ? "Submitting…" : "Create FFmpeg job"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
