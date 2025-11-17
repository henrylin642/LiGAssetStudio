"use client";

import { useState } from "react";
import { ScenePicker } from "@/components/scene-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { CreateJobInput, DownscaleOptions, FFmpegMode, FFmpegOptions, JobKind, Scene } from "@/types/dto";

interface BatchDrawerProps {
  assetIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateJob: (input: CreateJobInput) => Promise<void>;
  onUploadToScene: (input: BatchSceneUploadInput) => Promise<void>;
  scenes: Scene[];
  scenesLoading?: boolean;
}

export interface BatchSceneUploadInput {
  assetIds: string[];
  sceneId: number;
  nameTemplate: string;
  startIndex: number;
}

const DEFAULT_DOWNSCALE: DownscaleOptions = {
  target: "image",
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 80,
  keepAspectRatio: true,
  outputFormat: "jpg",
};

const DEFAULT_FFMPEG: FFmpegOptions = {
  mode: "targetCRF",
  targetFormat: "mp4",
  crf: 23,
  audioCopy: true,
  fastStart: true,
};

type BatchAction = JobKind | "sceneUpload";

export function BatchDrawer({ assetIds, open, onOpenChange, onCreateJob, onUploadToScene, scenes, scenesLoading }: BatchDrawerProps) {
  const [action, setAction] = useState<BatchAction>("downscale");
  const [downscale, setDownscale] = useState<DownscaleOptions>(DEFAULT_DOWNSCALE);
  const [ffmpeg, setFfmpeg] = useState<FFmpegOptions>(DEFAULT_FFMPEG);
  const [sceneId, setSceneId] = useState<number>();
  const [nameTemplate, setNameTemplate] = useState("{{assetName}}");
  const [startIndex, setStartIndex] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const selectedCount = assetIds.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedCount === 0) return;
    setSubmitting(true);
    try {
      if (action === "sceneUpload") {
        if (!sceneId) return;
        await onUploadToScene({
          assetIds,
          sceneId,
          nameTemplate,
          startIndex: Number.isFinite(startIndex) ? startIndex : 1,
        });
      } else {
        const payload: CreateJobInput = {
          kind: action,
          assetIds,
          options: action === "downscale" ? downscale : ffmpeg,
        };
        await onCreateJob(payload);
      }
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  function updateDownscale(partial: Partial<DownscaleOptions>) {
    setDownscale((previous) => ({ ...previous, ...partial }));
  }

  function updateFfmpeg(partial: Partial<FFmpegOptions>) {
    setFfmpeg((previous) => ({ ...previous, ...partial }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Batch Processing</SheetTitle>
          <SheetDescription>
            Run jobs or scene uploads for {selectedCount} selected assets in one go.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-6 overflow-y-auto py-4" onSubmit={handleSubmit}>
          <section className="space-y-2">
            <Label htmlFor="action">Batch action</Label>
            <Select value={action} onValueChange={(value) => setAction(value as BatchAction)}>
              <SelectTrigger id="action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downscale">Downscale (image)</SelectItem>
                <SelectItem value="ffmpeg">FFmpeg (video)</SelectItem>
                <SelectItem value="sceneUpload">Upload to Scene</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {action === "downscale" ? (
            <section className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maxWidth">Max width</Label>
                  <Input
                    id="maxWidth"
                    type="number"
                    min={1}
                    value={downscale.maxWidth ?? ""}
                    onChange={(event) => updateDownscale({ maxWidth: Number(event.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxHeight">Max height</Label>
                  <Input
                    id="maxHeight"
                    type="number"
                    min={1}
                    value={downscale.maxHeight ?? ""}
                    onChange={(event) => updateDownscale({ maxHeight: Number(event.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quality">Quality (1-100)</Label>
                <Input
                  id="quality"
                  type="number"
                  min={1}
                  max={100}
                  value={downscale.quality ?? ""}
                  onChange={(event) => updateDownscale({ quality: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="outputFormat">Output format</Label>
                <Select
                  value={downscale.outputFormat ?? "jpg"}
                  onValueChange={(value) => updateDownscale({ outputFormat: value as DownscaleOptions["outputFormat"] })}
                >
                  <SelectTrigger id="outputFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpg">JPG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="webp">WEBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          ) : null}

          {action === "ffmpeg" ? (
            <section className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mode">FFmpeg mode</Label>
                <Select
                  value={ffmpeg.mode}
                  onValueChange={(value) => updateFfmpeg({ mode: value as FFmpegMode })}
                >
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="targetCRF">Target CRF</SelectItem>
                    <SelectItem value="targetBitrateKbps">Target Bitrate (kbps)</SelectItem>
                    <SelectItem value="targetResolution">Target Resolution</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ffmpeg.mode === "targetBitrateKbps" ? (
                <div className="space-y-2">
                  <Label htmlFor="bitrate">Bitrate (kbps)</Label>
                  <Input
                    id="bitrate"
                    type="number"
                    min={100}
                    value={ffmpeg.bitrateKbps ?? ""}
                    onChange={(event) => updateFfmpeg({ bitrateKbps: Number(event.target.value) })}
                  />
                </div>
              ) : null}

              {ffmpeg.mode === "targetCRF" ? (
                <div className="space-y-2">
                  <Label htmlFor="crf">CRF</Label>
                  <Input
                    id="crf"
                    type="number"
                    min={0}
                    max={51}
                    value={ffmpeg.crf ?? ""}
                    onChange={(event) => updateFfmpeg({ crf: Number(event.target.value) })}
                  />
                </div>
              ) : null}

              {ffmpeg.mode === "targetResolution" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      type="number"
                      min={1}
                      value={ffmpeg.width ?? ""}
                      onChange={(event) => updateFfmpeg({ width: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      type="number"
                      min={1}
                      value={ffmpeg.height ?? ""}
                      onChange={(event) => updateFfmpeg({ height: Number(event.target.value) })}
                    />
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="targetFormat">Target format</Label>
                <Select
                  value={ffmpeg.targetFormat}
                  onValueChange={(value) => updateFfmpeg({ targetFormat: value as FFmpegOptions["targetFormat"] })}
                >
                  <SelectTrigger id="targetFormat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp4">MP4</SelectItem>
                    <SelectItem value="webm">WEBM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          ) : null}

          {action === "sceneUpload" ? (
            <section className="space-y-4">
              <div className="space-y-2">
                <Label>Scene</Label>
                <ScenePicker
                  scenes={scenes}
                  value={sceneId}
                  onChange={setSceneId}
                  placeholder={scenesLoading ? "Loading scenes…" : "Select scene"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameTemplate">AR object naming</Label>
                <Input
                  id="nameTemplate"
                  value={nameTemplate}
                  onChange={(event) => setNameTemplate(event.target.value)}
                  placeholder="{{assetName}}"
                />
                <p className="text-xs text-slate-500">
                  Use tokens like {"{{assetName}}"} and {"{{index}}"} to reuse the asset name or running number.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startIndex">Start index</Label>
                <Input
                  id="startIndex"
                  type="number"
                  min={1}
                  value={startIndex}
                  onChange={(event) => setStartIndex(Number(event.target.value) || 1)}
                />
              </div>
            </section>
          ) : null}

          <SheetFooter>
            <Button
              type="submit"
              disabled={selectedCount === 0 || submitting || (action === "sceneUpload" && !sceneId)}
              className="w-full sm:w-auto"
            >
              {submitting
                ? action === "sceneUpload"
                  ? "Uploading…"
                  : "Creating job..."
                : action === "sceneUpload"
                  ? "Upload to Scene"
                  : `Create ${action === "downscale" ? "Downscale" : "FFmpeg"} job`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
