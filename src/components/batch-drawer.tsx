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



export function BatchDrawer({ assetIds, open, onOpenChange, onCreateJob, onUploadToScene, scenes, scenesLoading }: BatchDrawerProps) {
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
      if (!sceneId) return;
      await onUploadToScene({
        assetIds,
        sceneId,
        nameTemplate,
        startIndex: Number.isFinite(startIndex) ? startIndex : 1,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
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

          <SheetFooter>
            <Button
              type="submit"
              disabled={selectedCount === 0 || submitting || !sceneId}
              className="w-full sm:w-auto"
            >
              {submitting
                ? "Uploading…"
                : "Upload to Scene"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
