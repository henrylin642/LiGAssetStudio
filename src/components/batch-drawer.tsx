"use client";

import { useState } from "react";
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
import type { CreateJobInput, DownscaleOptions, FFmpegMode, FFmpegOptions, JobKind } from "@/types/dto";

interface BatchDrawerProps {
  assetIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateJob: (input: CreateJobInput) => Promise<void>;
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

export function BatchDrawer({ assetIds, open, onOpenChange, onCreateJob }: BatchDrawerProps) {
  const [kind, setKind] = useState<JobKind>("downscale");
  const [downscale, setDownscale] = useState<DownscaleOptions>(DEFAULT_DOWNSCALE);
  const [ffmpeg, setFfmpeg] = useState<FFmpegOptions>(DEFAULT_FFMPEG);
  const [submitting, setSubmitting] = useState(false);
  const selectedCount = assetIds.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedCount === 0) return;
    setSubmitting(true);
    try {
      const payload: CreateJobInput = {
        kind,
        assetIds,
        options: kind === "downscale" ? downscale : ffmpeg,
      };
      await onCreateJob(payload);
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
            Configure a {kind === "downscale" ? "downscale" : "FFmpeg"} job for {selectedCount} selected assets.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col gap-6 overflow-y-auto py-4" onSubmit={handleSubmit}>
          <section className="space-y-2">
            <Label htmlFor="kind">Job type</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as JobKind)}>
              <SelectTrigger id="kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="downscale">Downscale (image)</SelectItem>
                <SelectItem value="ffmpeg">FFmpeg (video)</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {kind === "downscale" ? (
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
          ) : (
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
          )}

          <SheetFooter>
            <Button type="submit" disabled={selectedCount === 0 || submitting} className="w-full sm:w-auto">
              {submitting ? "Creating job..." : `Create ${kind === "downscale" ? "Downscale" : "FFmpeg"} job`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
