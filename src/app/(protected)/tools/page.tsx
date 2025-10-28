"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScenePicker } from "@/components/scene-picker";
import { useCreateJobMutation } from "@/hooks/use-jobs";
import { useApi } from "@/hooks/use-api";
import { useScenesQuery } from "@/hooks/use-scenes";
import { InfoBallPreview } from "@/components/info-ball-preview";
import { GalleryAssetPicker } from "@/components/gallery-asset-picker";
import type { DownscaleOptions, FFmpegOptions, UploadedAsset } from "@/types/dto";

const KB = 1024;

function adjustArray<T>(arr: T[], length: number, fillValue: T): T[] {
  const next = arr.slice(0, length);
  while (next.length < length) {
    next.push(fillValue);
  }
  return next;
}

async function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function extractImageMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = (event, source, lineno, colno, error) => {
        URL.revokeObjectURL(url);
        reject(error ?? new Error("Failed to load image"));
      };
      img.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function extractVideoMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{
      width: number;
      height: number;
      duration: number;
      mimeType: string;
    }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
          mimeType: file.type,
        });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video metadata"));
      };
      video.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

type GltfScene = {
  scene: {
    traverse: (visitor: (child: unknown) => void) => void;
  };
};

type InfoBallPhotoSelection = {
  id: string;
  name: string;
} | null;

type ActionFieldType = "text" | "url" | "number" | "boolean";

type ActionFieldConfig = {
  key: string;
  label: string;
  type: ActionFieldType;
  placeholder?: string;
  required?: boolean;
};

type InfoBallAction = {
  id: number;
  values: Record<string, string | number | boolean | null>;
};

type InfoBallEvent = {
  id: number;
  values: Record<string, unknown>;
  actions: InfoBallAction[];
};

const EVENT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Touch" },
  { value: 5, label: "Location" },
  { value: 6, label: "LookAt" },
  { value: 7, label: "RepeatForever" },
  { value: 8, label: "Time" },
  { value: 9, label: "SceneStart" },
  { value: 10, label: "ProximityEnter" },
  { value: 11, label: "ProximityLeave" },
  { value: 12, label: "Period" },
];

const ACTION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 3, label: "move" },
  { value: 6, label: "playVideo" },
  { value: 7, label: "showHiddenNode" },
  { value: 8, label: "openWeb" },
  { value: 9, label: "hiddenNode" },
  { value: 10, label: "animateSpeed" },
  { value: 11, label: "animateControl" },
  { value: 12, label: "animateRepeatCount" },
  { value: 13, label: "rotateBy" },
  { value: 15, label: "scale" },
  { value: 19, label: "fadeOpacityTo" },
  { value: 21, label: "curveMove" },
  { value: 22, label: "moveToFace" },
  { value: 23, label: "playAudio" },
  { value: 24, label: "playImpactFeedback" },
  { value: 25, label: "switchScene" },
  { value: 26, label: "uiAction" },
  { value: 27, label: "game" },
  { value: 28, label: "moveTo" },
  { value: 33, label: "aim" },
  { value: 34, label: "stopanimation" },
  { value: 35, label: "disable" },
  { value: 36, label: "enable" },
  { value: 37, label: "panoramaurl" },
  { value: 39, label: "aibot" },
  { value: 40, label: "switchBackScene" },
  { value: 41, label: "openmap" },
  { value: 44, label: "callapi" },
  { value: 110, label: "mazu" },
];

const ACTION_FIELD_CONFIG: Record<number, ActionFieldConfig[]> = {
  6: [
    { key: "url", label: "影片 URL", type: "url", placeholder: "https://example.com/video.mp4", required: true },
    { key: "play_count", label: "播放次數", type: "number" },
    { key: "delay_time", label: "延遲 (ms)", type: "number" },
    { key: "group", label: "群組", type: "text" },
  ],
  8: [
    { key: "url", label: "開啟網址", type: "url", placeholder: "https://...", required: true },
    { key: "auth", label: "需要登入", type: "boolean" },
    { key: "delay_time", label: "延遲 (ms)", type: "number" },
    { key: "group", label: "群組", type: "text" },
    { key: "obj_id", label: "物件 ID", type: "text" },
    { key: "play_count", label: "播放次數", type: "number" },
  ],
  23: [
    { key: "url", label: "音訊 URL", type: "url", placeholder: "https://...", required: true },
    { key: "play_count", label: "播放次數", type: "number" },
    { key: "delay_time", label: "延遲 (ms)", type: "number" },
    { key: "group", label: "群組", type: "text" },
  ],
  41: [
    { key: "url", label: "地圖網址", type: "url", placeholder: "https://maps...", required: true },
    { key: "auth", label: "需要登入", type: "boolean" },
    { key: "delay_time", label: "延遲 (ms)", type: "number" },
    { key: "group", label: "群組", type: "text" },
  ],
};

const DEFAULT_ACTION_ID = 8;
const DEFAULT_EVENT_ID = 1;

function getActionFieldConfigs(actionId: number): ActionFieldConfig[] {
  return ACTION_FIELD_CONFIG[actionId] ?? [];
}

function createDefaultAction(actionId: number): InfoBallAction {
  const fieldConfig = getActionFieldConfigs(actionId);
  const values: InfoBallAction["values"] = {};

  fieldConfig.forEach((field) => {
    if (field.type === "boolean") {
      values[field.key] = false;
    } else {
      values[field.key] = "";
    }
  });

  if (!values.delay_time) {
    values.delay_time = null;
  }
  if (!values.group) {
    values.group = null;
  }

  return {
    id: actionId,
    values,
  };
}

function createDefaultFaceEvent(): InfoBallEvent {
  return {
    id: DEFAULT_EVENT_ID,
    values: {},
    actions: [],
  };
}

function sanitizeActionValues(values: InfoBallAction["values"]) {
  return Object.entries(values).reduce<Record<string, string | number | boolean | null>>((acc, [key, rawValue]) => {
    if (rawValue === "" || rawValue === undefined) {
      acc[key] = null;
      return acc;
    }
    acc[key] = rawValue as string | number | boolean | null;
    return acc;
  }, {});
}


async function extractGlbMetadata(file: File) {
  const { GLTFLoader } = (await import("three/examples/jsm/loaders/GLTFLoader.js")) as typeof import("three/examples/jsm/loaders/GLTFLoader.js");
  const arrayBuffer = await file.arrayBuffer();
  const loader = new GLTFLoader();
  const gltf = await new Promise<GltfScene>((resolve, reject) => {
    loader.parse(arrayBuffer, "", resolve, reject);
  });

  let triangleCount = 0;
  let meshCount = 0;
  const materialNames = new Set<string>();

  gltf.scene.traverse((child: unknown) => {
    const node = child as {
      isMesh?: boolean;
      geometry?: {
        getIndex: () => { count: number } | null;
        getAttribute: (name: string) => { count: number } | undefined;
      };
      material?: unknown;
    };

    if (node.geometry && (node.isMesh ?? true)) {
      meshCount += 1;
      const geometry = node.geometry;
      const index = geometry.getIndex();
      const position = geometry.getAttribute("position");
      if (index) {
        triangleCount += Math.round(index.count / 3);
      } else if (position) {
        triangleCount += Math.round(position.count / 3);
      }
    }
    const material = (node as { material?: { name?: string } | { name?: string }[] }).material;
    if (Array.isArray(material)) {
      material.forEach((mat) => mat?.name && materialNames.add(mat.name));
    } else if (material && typeof material === "object" && "name" in material && material.name) {
      materialNames.add(material.name as string);
    }
  });

  return {
    triangleCount,
    meshCount,
    materialCount: materialNames.size,
  };
}

async function extractMetadata(file: File) {
  const meta: Record<string, unknown> = {
    general: {
      name: file.name,
      type: file.type,
      size: file.size,
    },
  };

  try {
    if (file.type.startsWith("image/")) {
      meta.image = await extractImageMetadata(file);
    } else if (file.type.startsWith("video/")) {
      meta.video = await extractVideoMetadata(file);
    } else if (file.name.toLowerCase().endsWith(".glb")) {
      meta.model = await extractGlbMetadata(file);
    }
  } catch (error) {
    console.warn("Failed to extract metadata", error);
  }

  return meta;
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "-";
  if (bytes < KB) return `${bytes.toFixed(0)} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < KB * KB * KB) return `${(bytes / KB / KB).toFixed(1)} MB`;
  return `${(bytes / KB / KB / KB).toFixed(1)} GB`;
}

export default function ToolsPage() {
  const queryClient = useQueryClient();

  const uploadsQuery = useQuery<UploadedAsset[], Error>({
    queryKey: ["tools", "uploads"],
    queryFn: async () => {
      const response = await fetch("/api/tools/uploads");
      if (!response.ok) {
        throw new Error("Unable to load uploaded files");
      }
      return (await response.json()) as UploadedAsset[];
    },
  });

  const uploadMutation = useMutation<{ uploads: UploadedAsset[] }, Error, FileList>({
    mutationFn: async (files) => {
      const processed = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUri: await readDataUrl(file),
          meta: await extractMetadata(file),
        })),
      );

      const response = await fetch("/api/tools/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: processed }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "Upload failed");
      }

      return (await response.json()) as { uploads: UploadedAsset[] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools", "uploads"] });
    },
  });

  const uploads = useMemo(() => uploadsQuery.data ?? [], [uploadsQuery.data]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [infoBallIsChild, setInfoBallIsChild] = useState(false);
  const [infoBallIsHidden, setInfoBallIsHidden] = useState(false);
  const [infoBallAllowPinch, setInfoBallAllowPinch] = useState(false);
  const [infoBallIsOcclusion, setInfoBallIsOcclusion] = useState(false);
  const [infoBallFloorCount, setInfoBallFloorCount] = useState(3);
  const [infoBallFaceCount, setInfoBallFaceCount] = useState(6);
  const [infoBallFloorHeight, setInfoBallFloorHeight] = useState(0.5);
  const [infoBallFloorGap, setInfoBallFloorGap] = useState(0.05);
  const [infoBallFaceWidth, setInfoBallFaceWidth] = useState(0.5);
  const [infoBallFaceGap, setInfoBallFaceGap] = useState(0.1);
  const [infoBallSpeed, setInfoBallSpeed] = useState(30);
  const [infoBallFloorAngles, setInfoBallFloorAngles] = useState<number[]>([37, 0, -37]);
  const [infoBallFaceGapList, setInfoBallFaceGapList] = useState<number[]>([0.1, 0.3, 0.1]);
  const [infoBallPhotos, setInfoBallPhotos] = useState<string[]>(Array(18).fill(""));
  const [infoBallPhotoSelections, setInfoBallPhotoSelections] = useState<InfoBallPhotoSelection[]>(
    Array.from({ length: 18 }, () => null),
  );
  const [infoBallPhotoPickerOpen, setInfoBallPhotoPickerOpen] = useState(false);
  const [infoBallPhotoPickerIndex, setInfoBallPhotoPickerIndex] = useState<number | null>(null);
  const [infoBallPreviewZoom, setInfoBallPreviewZoom] = useState(1);
  const infoBallPhotosCount = infoBallFloorCount * infoBallFaceCount;
  const [infoBallFaceInteractions, setInfoBallFaceInteractions] = useState<InfoBallEvent[]>(() =>
    Array.from({ length: infoBallPhotosCount }, () => createDefaultFaceEvent()),
  );
  const [infoBallSubEventPrefix, setInfoBallSubEventPrefix] = useState("");
  const deleteMutation = useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (id) => {
      const response = await fetch(`/api/tools/uploads?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "Failed to delete");
      }
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tools", "uploads"] });
    },
  });

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => uploads.some((upload) => upload.id === id)));
  }, [uploads]);

  useEffect(() => {
    setInfoBallFloorAngles((prev) => adjustArray(prev, infoBallFloorCount, prev[prev.length - 1] ?? 0));
  }, [infoBallFloorCount]);

  useEffect(() => {
    setInfoBallFaceGapList((prev) => adjustArray(prev, infoBallFloorCount, infoBallFaceGap));
  }, [infoBallFloorCount, infoBallFaceGap]);

  useEffect(() => {
    setInfoBallPhotos((prev) => adjustArray(prev, infoBallPhotosCount, ""));
  }, [infoBallPhotosCount]);

  useEffect(() => {
    setInfoBallPhotoSelections((prev) => adjustArray(prev, infoBallPhotosCount, null));
  }, [infoBallPhotosCount]);

  useEffect(() => {
    setInfoBallFaceInteractions((prev) => {
      const next = prev.slice(0, infoBallPhotosCount);
      while (next.length < infoBallPhotosCount) {
        next.push(createDefaultFaceEvent());
      }
      return next;
    });
  }, [infoBallPhotosCount]);

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
    audioBitrateKbps: 128,
    preset: "slow",
  });

  const [ffmpegRateStrategy, setFfmpegRateStrategy] = useState<"crf" | "bitrate" | "targetSize">("crf");
  const [ffmpegCrf, setFfmpegCrf] = useState<number>(27);
  const [manualBitrateKbps, setManualBitrateKbps] = useState<number>(1500);
  const [targetSizeMb, setTargetSizeMb] = useState<number>(50);
  const [audioBitrateKbps, setAudioBitrateKbps] = useState<number>(128);

  const [sceneId, setSceneId] = useState<number>();
  const [sceneName, setSceneName] = useState("");
  const [uploadingToScene, setUploadingToScene] = useState(false);

  const createJob = useCreateJobMutation();
  const api = useApi();
  const scenesQuery = useScenesQuery();

  useEffect(() => {
    setFfmpeg((prev) => ({ ...prev, audioBitrateKbps: audioBitrateKbps }));
  }, [audioBitrateKbps]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadMutation.mutateAsync(files);
    event.target.value = "";
  }

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return Array.from(set);
    });
  };

  async function submitDownscale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length) return;
    await createJob.mutateAsync({
      kind: "downscale",
      assetIds: selectedIds,
      options: downscale,
    });
  }

  async function submitFfmpeg(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length) return;
    const safeAudioBitrate = Math.max(32, Math.round(audioBitrateKbps));
    const options: FFmpegOptions = {
      ...ffmpeg,
      audioBitrateKbps: safeAudioBitrate,
    };

    if (ffmpegRateStrategy === "crf") {
      options.mode = "targetCRF";
      options.crf = ffmpegCrf;
      options.bitrateKbps = undefined;
    } else if (ffmpegRateStrategy === "bitrate") {
      options.mode = "targetBitrateKbps";
      options.crf = undefined;
      options.bitrateKbps = Math.max(100, Math.round(manualBitrateKbps));
    } else {
      options.mode = "targetBitrateKbps";
      options.crf = undefined;
      const computed = computedTargetBitrate?.videoKbps ?? manualBitrateKbps;
      options.bitrateKbps = Math.max(100, Math.round(computed));
    }

    await createJob.mutateAsync({
      kind: "ffmpeg",
      assetIds: selectedIds,
      options,
    });
  }

  async function submitUploadToScene(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length || !sceneId || !sceneName) return;
    setUploadingToScene(true);
    try {
      await Promise.all(
        selectedIds.map((assetId) =>
          api("/scenes/upload-from-asset", {
            method: "POST",
            body: JSON.stringify({ assetId, sceneId, name: sceneName }),
          }),
        ),
      );
    } finally {
      setUploadingToScene(false);
    }
  }

  const activeAsset = useMemo(() => {
    if (!uploads.length) return null;
    return uploads.find((upload) => selectedIds.includes(upload.id)) ?? uploads[0];
  }, [uploads, selectedIds]);

  const activeVideoMeta = useMemo(() => {
    return (activeAsset?.meta?.video as {
      width?: number;
      height?: number;
      duration?: number;
      mimeType?: string;
    }) ?? undefined;
  }, [activeAsset]);

  const videoDurationSeconds = activeVideoMeta?.duration ?? null;

  const computedTargetBitrate = useMemo(() => {
    if (ffmpegRateStrategy !== "targetSize" || !videoDurationSeconds || videoDurationSeconds <= 0) {
      return null;
    }
    if (!Number.isFinite(targetSizeMb) || targetSizeMb <= 0) {
      return null;
    }
    const totalKbps = (targetSizeMb * 8192) / videoDurationSeconds;
    const videoKbps = Math.max(totalKbps - audioBitrateKbps, 100);
    return {
      totalKbps: Math.max(100, Math.round(totalKbps)),
      videoKbps: Math.max(100, Math.round(videoKbps)),
    };
  }, [ffmpegRateStrategy, videoDurationSeconds, targetSizeMb, audioBitrateKbps]);

  const infoBallSubEvents = useMemo(() => {
    const prefix = infoBallSubEventPrefix.trim();
    const map: Record<string, InfoBallEvent[]> = {};

    infoBallFaceInteractions.forEach((eventConfig, index) => {
      if (!eventConfig) return;
      const serializedActions = eventConfig.actions
        .map((action) => ({
          id: action.id,
          values: sanitizeActionValues(action.values ?? {}),
        }))
        .filter((action) => action.id && Object.keys(action.values ?? {}).length > 0);

      if (serializedActions.length === 0) return;

      const key = prefix ? `${prefix}_${index + 1}` : `face_${index + 1}`;
      map[key] = [
        {
          id: eventConfig.id,
          values: eventConfig.values ?? {},
          actions: serializedActions,
        },
      ];
    });

    return map;
  }, [infoBallFaceInteractions, infoBallSubEventPrefix]);

  const infoBallModel = useMemo(() => {
    const floorAngles = Array.from({ length: infoBallFloorCount }, (_, index) =>
      Number.isFinite(infoBallFloorAngles[index]) ? Number(infoBallFloorAngles[index]) : 0,
    );
    const faceGapList = Array.from({ length: infoBallFloorCount }, (_, index) =>
      Number.isFinite(infoBallFaceGapList[index]) ? Number(infoBallFaceGapList[index]) : infoBallFaceGap,
    );
    const photos = Array.from({ length: infoBallPhotosCount }, (_, index) => infoBallPhotos[index] ?? "");

    return {
      type: 13,
      fields: {
        is_child: infoBallIsChild,
        is_hidden: infoBallIsHidden,
        is_allow_pinch: infoBallAllowPinch,
        floor_count: infoBallFloorCount,
        floor_height: infoBallFloorHeight,
        floor_gap: infoBallFloorGap,
        face_width: infoBallFaceWidth,
        face_count: infoBallFaceCount,
        face_gap: infoBallFaceGap,
        speed: infoBallSpeed,
        is_occlusion: infoBallIsOcclusion,
        floor_angles: floorAngles,
        face_gap_list: faceGapList,
        prefixes: ["api/v1/ar_objects", "api/ar_objects", "api/base", "application"],
        template: "ar_objects_from_scene",
        layout: {},
      },
      texture: {
        photos,
      },
      ios_texture: null,
      android_texture: null,
      sub_events: infoBallSubEvents,
    };
  }, [
    infoBallSubEvents,
    infoBallAllowPinch,
    infoBallFaceCount,
    infoBallFaceGap,
    infoBallFaceGapList,
    infoBallFaceWidth,
    infoBallFloorAngles,
    infoBallFloorCount,
    infoBallFloorGap,
    infoBallFloorHeight,
    infoBallIsChild,
    infoBallIsHidden,
    infoBallIsOcclusion,
    infoBallPhotos,
    infoBallPhotosCount,
    infoBallSpeed,
  ]);

  const infoBallJsonString = useMemo(() => JSON.stringify(infoBallModel, null, 2), [infoBallModel]);

  const layerOrder = useMemo(
    () => Array.from({ length: infoBallFloorCount }, (_, index) => index),
    [infoBallFloorCount],
  );

  const clampPreviewZoom = (value: number) => Math.min(3, Math.max(0.3, Number(value.toFixed(2))));
  const adjustPreviewZoom = (delta: number) => {
    setInfoBallPreviewZoom((prev) => clampPreviewZoom(prev + delta));
  };
  const resetPreviewZoom = () => setInfoBallPreviewZoom(1);

  const handleCopyInfoBallJson = async () => {
    try {
      await navigator.clipboard.writeText(infoBallJsonString);
    } catch (error) {
      console.error("Failed to copy InfoBall JSON", error);
    }
  };

  const cloneEvent = (eventConfig: InfoBallEvent): InfoBallEvent => ({
    id: eventConfig.id,
    values: { ...eventConfig.values },
    actions: eventConfig.actions.map((action) => ({
      id: action.id,
      values: { ...action.values },
    })),
  });

  const updateFaceEvent = (faceIndex: number, updater: (eventConfig: InfoBallEvent) => InfoBallEvent) => {
    setInfoBallFaceInteractions((prev) => {
      const next = prev.slice();
      const base = prev[faceIndex] ?? createDefaultFaceEvent();
      next[faceIndex] = updater(cloneEvent(base));
      return next;
    });
  };

  const handleEventTypeChange = (faceIndex: number, eventId: number) => {
    updateFaceEvent(faceIndex, (eventConfig) => ({
      ...eventConfig,
      id: eventId,
    }));
  };

  const handleAddAction = (faceIndex: number) => {
    updateFaceEvent(faceIndex, (eventConfig) => ({
      ...eventConfig,
      actions: [...eventConfig.actions, createDefaultAction(DEFAULT_ACTION_ID)],
    }));
  };

  const handleRemoveAction = (faceIndex: number, actionIndex: number) => {
    updateFaceEvent(faceIndex, (eventConfig) => ({
      ...eventConfig,
      actions: eventConfig.actions.filter((_, index) => index !== actionIndex),
    }));
  };

  const handleActionTypeChange = (faceIndex: number, actionIndex: number, actionId: number) => {
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const previous = actions[actionIndex];
      const nextAction = createDefaultAction(actionId);
      if (previous) {
        const previousValues = previous.values ?? {};
        const nextKeys = getActionFieldConfigs(actionId).map((field) => field.key);
        nextKeys.forEach((key) => {
          if (previousValues[key] !== undefined) {
            nextAction.values[key] = previousValues[key];
          }
        });
      }
      actions[actionIndex] = nextAction;
      return { ...eventConfig, actions };
    });
  };

  const handleActionFieldChange = (
    faceIndex: number,
    actionIndex: number,
    field: ActionFieldConfig,
    rawValue: string,
  ) => {
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const action = actions[actionIndex];
      if (!action) return eventConfig;

      let value: string | number | boolean | null = rawValue;
      if (field.type === "number") {
        if (rawValue === "") {
          value = null;
        } else {
          const parsed = Number(rawValue);
          value = Number.isNaN(parsed) ? null : parsed;
        }
      }
      if (field.type === "url" || field.type === "text") {
        value = rawValue;
      }

      action.values = { ...action.values, [field.key]: value };
      actions[actionIndex] = action;
      return { ...eventConfig, actions };
    });
  };

  const handleActionBooleanChange = (
    faceIndex: number,
    actionIndex: number,
    fieldKey: string,
    checked: boolean,
  ) => {
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const action = actions[actionIndex];
      if (!action) return eventConfig;
      action.values = { ...action.values, [fieldKey]: checked };
      actions[actionIndex] = action;
      return { ...eventConfig, actions };
    });
  };

  const handleCustomFieldValueChange = (
    faceIndex: number,
    actionIndex: number,
    fieldKey: string,
    newValue: string,
  ) => {
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const action = actions[actionIndex];
      if (!action) return eventConfig;
      action.values = { ...action.values, [fieldKey]: newValue };
      actions[actionIndex] = action;
      return { ...eventConfig, actions };
    });
  };

  const handleRemoveCustomField = (faceIndex: number, actionIndex: number, fieldKey: string) => {
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const action = actions[actionIndex];
      if (!action) return eventConfig;
      const updatedValues = { ...action.values };
      delete updatedValues[fieldKey];
      action.values = updatedValues;
      actions[actionIndex] = action;
      return { ...eventConfig, actions };
    });
  };

  const handleAddCustomActionField = (faceIndex: number, actionIndex: number) => {
    const newKey = window.prompt("請輸入欄位名稱（例如 url 或 obj_id）");
    if (!newKey) return;
    updateFaceEvent(faceIndex, (eventConfig) => {
      const actions = eventConfig.actions.slice();
      const action = actions[actionIndex];
      if (!action) return eventConfig;
      if (action.values[newKey] !== undefined) {
        return eventConfig;
      }
      action.values = { ...action.values, [newKey]: "" };
      actions[actionIndex] = action;
      return { ...eventConfig, actions };
    });
  };

  return (
    <>
      <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">Tools</h1>
        <p className="text-sm text-slate-500">
          上傳外部素材並使用批次工具進行編輯。若要處理既有 LIG 資產，請回到
          <Link href="/" className="text-slate-900 underline">
            Gallery
          </Link>
          或 Asset 詳情頁。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Files</CardTitle>
          <CardDescription>支援圖片、影音與 3D 模型（png/jpg/webp、mp4/webm、glb）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="uploadFiles">選擇檔案</Label>
            <Input id="uploadFiles" type="file" multiple className="cursor-pointer" onChange={handleFileChange} />
            {uploadMutation.isError ? (
              <p className="text-xs text-red-600">{uploadMutation.error.message}</p>
            ) : null}
            {uploadMutation.isPending ? <p className="text-xs text-slate-500">上傳中…</p> : null}
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-slate-200 bg-slate-50">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-100 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">使用</th>
                  <th className="px-3 py-2">檔案</th>
                  <th className="px-3 py-2">大小</th>
                  <th className="px-3 py-2">類型</th>
                  <th className="px-3 py-2 text-right">移除</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selectedIds.includes(upload.id)}
                        onCheckedChange={(checked) => toggleSelection(upload.id, Boolean(checked))}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{upload.name}</td>
                    <td className="px-3 py-2 text-slate-500">{formatSize(upload.size)}</td>
                    <td className="px-3 py-2 text-slate-500">{upload.type || "unknown"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => deleteMutation.mutate(upload.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {uploads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                      尚未上傳任何檔案。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">已選取 {selectedIds.length} 個檔案。</p>
          {deleteMutation.isError ? (
            <p className="text-xs text-red-600">刪除失敗：{deleteMutation.error?.message}</p>
          ) : null}

          {activeAsset ? (
            <Card>
              <CardHeader>
                <CardTitle>資訊面板</CardTitle>
                <CardDescription>{activeAsset.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div>
                  <p>檔案大小：{formatSize(activeAsset.size)}</p>
                  <p>類型：{activeAsset.type || "unknown"}</p>
                  <p>上傳時間：{new Date(activeAsset.createdAt).toLocaleString()}</p>
                </div>
                {activeAsset.meta && "image" in activeAsset.meta ? (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">圖片資訊</h4>
                    <p>
                      解析度：
                      {(activeAsset.meta.image as { width?: number; height?: number })?.width ?? "-"} ×
                      {(activeAsset.meta.image as { width?: number; height?: number })?.height ?? "-"} px
                    </p>
                  </div>
                ) : null}
                {activeAsset.meta && "video" in activeAsset.meta ? (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">影片資訊</h4>
                    <p>
                      解析度：
                      {(activeAsset.meta.video as { width?: number; height?: number })?.width ?? "-"} ×
                      {(activeAsset.meta.video as { width?: number; height?: number })?.height ?? "-"} px
                    </p>
                    <p>
                      時長：
                      {(
                        activeAsset.meta.video as { width?: number; height?: number; duration?: number }
                      )?.duration?.toFixed(2) ?? "-"} 秒
                    </p>
                    <p>編碼：{(activeAsset.meta.video as { mimeType?: string })?.mimeType ?? "unknown"}</p>
                  </div>
                ) : null}
                {activeAsset.meta && "model" in activeAsset.meta ? (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">3D 模型資訊</h4>
                    <p>
                      面數：
                      {(activeAsset.meta.model as { triangleCount?: number })?.triangleCount?.toLocaleString() ??
                        "-"}
                    </p>
                    <p>
                      Mesh 數量：
                      {(activeAsset.meta.model as { meshCount?: number })?.meshCount?.toLocaleString() ?? "-"}
                    </p>
                    <p>
                      材質數量：
                      {(activeAsset.meta.model as { materialCount?: number })?.materialCount?.toLocaleString() ??
                        "-"}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="downscale" className="w-full">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="downscale">Downscale</TabsTrigger>
          <TabsTrigger value="ffmpeg">FFmpeg</TabsTrigger>
          <TabsTrigger value="upload">Upload to Scene</TabsTrigger>
          <TabsTrigger value="infoball">資訊球 1.0</TabsTrigger>
        </TabsList>

        <TabsContent value="downscale">
          <Card>
            <CardHeader>
              <CardTitle>Downscale Job</CardTitle>
              <CardDescription>對上傳的圖片檔進行尺寸縮放。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submitDownscale}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="downscale-width">Max width</Label>
                    <Input
                      id="downscale-width"
                      type="number"
                      value={downscale.maxWidth ?? ""}
                      onChange={(event) => setDownscale((prev) => ({ ...prev, maxWidth: Number(event.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="downscale-height">Max height</Label>
                    <Input
                      id="downscale-height"
                      type="number"
                      value={downscale.maxHeight ?? ""}
                      onChange={(event) => setDownscale((prev) => ({ ...prev, maxHeight: Number(event.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="downscale-quality">Quality</Label>
                  <Input
                    id="downscale-quality"
                    type="number"
                    value={downscale.quality ?? ""}
                    onChange={(event) => setDownscale((prev) => ({ ...prev, quality: Number(event.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="downscale-format">Output format</Label>
                  <Input
                    id="downscale-format"
                    value={downscale.outputFormat ?? ""}
                    onChange={(event) =>
                      setDownscale((prev) => ({
                        ...prev,
                        outputFormat: event.target.value as DownscaleOptions["outputFormat"],
                      }))
                    }
                  />
                </div>
                <Button type="submit" disabled={createJob.isPending || selectedIds.length === 0}>
                  {createJob.isPending ? "Submitting…" : "Create downscale job"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="infoball">
          <Card>
            <CardHeader>
              <CardTitle>資訊球 1.0 配置</CardTitle>
              <CardDescription>
                組合多層環形圖片，匯出 LiG 資訊球 1.0 所需的 JSON 與預覽。請先將 PNG 圖片上傳至 LiG Cloud 取得可用的
                URL，再貼入下方欄位。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="infoball-floor-count">層數 (floor_count)</Label>
                    <Input
                      id="infoball-floor-count"
                      type="number"
                      min={1}
                      max={10}
                      value={infoBallFloorCount}
                      onChange={(event) => setInfoBallFloorCount(Number(event.target.value) || 0)}
                    />
                    <p className="text-xs text-slate-500">建議 3 層，可視需求調整。</p>
                  </div>
                  <div>
                    <Label htmlFor="infoball-face-count">每層面數 (face_count)</Label>
                    <Input
                      id="infoball-face-count"
                      type="number"
                      min={3}
                      max={16}
                      value={infoBallFaceCount}
                      onChange={(event) => setInfoBallFaceCount(Number(event.target.value) || 0)}
                    />
                    <p className="text-xs text-slate-500">建議 6-10 張圖片 / 層。</p>
                  </div>
                  <div>
                    <Label htmlFor="infoball-face-width">圖片寬度 (face_width)</Label>
                    <Input
                      id="infoball-face-width"
                      type="number"
                      step={0.05}
                      value={infoBallFaceWidth}
                      onChange={(event) => setInfoBallFaceWidth(Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="infoball-floor-height">圖片高度 (floor_height)</Label>
                    <Input
                      id="infoball-floor-height"
                      type="number"
                      step={0.05}
                      value={infoBallFloorHeight}
                      onChange={(event) => setInfoBallFloorHeight(Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="infoball-face-gap">面間距 (face_gap)</Label>
                    <Input
                      id="infoball-face-gap"
                      type="number"
                      step={0.05}
                      value={infoBallFaceGap}
                      onChange={(event) => setInfoBallFaceGap(Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="infoball-floor-gap">層間距 (floor_gap)</Label>
                    <Input
                      id="infoball-floor-gap"
                      type="number"
                      step={0.05}
                      value={infoBallFloorGap}
                      onChange={(event) => setInfoBallFloorGap(Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="infoball-speed">旋轉速度 (speed)</Label>
                    <Input
                      id="infoball-speed"
                      type="number"
                      step={1}
                      value={infoBallSpeed}
                      onChange={(event) => setInfoBallSpeed(Number(event.target.value))}
                    />
                    <p className="text-xs text-slate-500">單位約為度/秒，可視需要調整。</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={infoBallIsChild} onCheckedChange={(checked) => setInfoBallIsChild(Boolean(checked))} />
                    <Label className="text-sm font-medium text-slate-700">is_child</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={infoBallIsHidden} onCheckedChange={(checked) => setInfoBallIsHidden(Boolean(checked))} />
                    <Label className="text-sm font-medium text-slate-700">is_hidden</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox checked={infoBallAllowPinch} onCheckedChange={(checked) => setInfoBallAllowPinch(Boolean(checked))} />
                    <Label className="text-sm font-medium text-slate-700">is_allow_pinch</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={infoBallIsOcclusion}
                      onCheckedChange={(checked) => setInfoBallIsOcclusion(Boolean(checked))}
                    />
                    <Label className="text-sm font-medium text-slate-700">is_occlusion</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">層角度與面間距</h3>
                {layerOrder.map((layerIndex, displayIndex) => (
                  <div key={`infoball-layer-${layerIndex}`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <Label htmlFor={`infoball-angle-${layerIndex}`}>第 {displayIndex + 1} 層角度 (°)</Label>
                      <Input
                        id={`infoball-angle-${layerIndex}`}
                        type="number"
                        step={1}
                        value={infoBallFloorAngles[layerIndex] ?? 0}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setInfoBallFloorAngles((prev) => {
                            const next = prev.slice();
                            next[layerIndex] = value;
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`infoball-gap-${layerIndex}`}>第 {displayIndex + 1} 層面間距</Label>
                      <Input
                        id={`infoball-gap-${layerIndex}`}
                        type="number"
                        step={0.05}
                        value={infoBallFaceGapList[layerIndex] ?? infoBallFaceGap}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setInfoBallFaceGapList((prev) => {
                            const next = prev.slice();
                            next[layerIndex] = value;
                            return next;
                          });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">圖片連結</h3>
                <p className="text-xs text-slate-500">
                  總共需要 {infoBallPhotosCount} 張圖片。請依序貼上已上傳至 LiG Cloud 的 PNG URL（第一層為最下層，往上遞增）。
                </p>
                <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <Label htmlFor="infoball-sub-events-prefix">Sub events prefix</Label>
                  <Input
                    id="infoball-sub-events-prefix"
                    value={infoBallSubEventPrefix}
                    onChange={(event) => setInfoBallSubEventPrefix(event.target.value)}
                    placeholder="例如：68166（會生成 68166_1, 68166_2 ...）"
                  />
                  <p className="text-xs text-slate-500">
                    未輸入時會使用 key：<code>face_序號</code>。輸入後會套用「前綴_序號」產生 sub_events。
                  </p>
                </div>
                {layerOrder.map((layerIndex, displayIndex) => (
                  <div key={`infoball-layer-input-${layerIndex}`} className="space-y-2 rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-500">第 {displayIndex + 1} 層</p>
                    {Array.from({ length: infoBallFaceCount }).map((_, faceIndex) => {
                      const idx = layerIndex * infoBallFaceCount + faceIndex;
                      const faceEvent = infoBallFaceInteractions[idx] ?? createDefaultFaceEvent();
                      const eventLabel =
                        EVENT_OPTIONS.find((option) => option.value === faceEvent.id)?.label ?? `事件 ${faceEvent.id}`;
                      const summaryLabel =
                        faceEvent.actions.length > 0 ? `${eventLabel} · 動作 ${faceEvent.actions.length} 個` : `${eventLabel} · 尚未設定動作`;
                      return (
                        <div key={`infoball-photo-${idx}`} className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`infoball-photo-${idx}`}>面 {faceIndex + 1}</Label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input
                                id={`infoball-photo-${idx}`}
                                value={infoBallPhotos[idx] ?? ""}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setInfoBallPhotos((prev) => {
                                    const next = prev.slice();
                                    next[idx] = value;
                                    return next;
                                  });
                                  setInfoBallPhotoSelections((prev) => {
                                    const next = prev.slice();
                                    next[idx] = null;
                                    return next;
                                  });
                                }}
                                placeholder="https://assets.lig.com.tw/ar_asset/...png"
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setInfoBallPhotoPickerIndex(idx);
                                  setInfoBallPhotoPickerOpen(true);
                                }}
                                className="sm:w-40"
                              >
                                從 Gallery 選擇
                              </Button>
                            </div>
                            {infoBallPhotoSelections[idx] ? (
                              <p className="text-xs text-slate-500">
                                已選擇：「{infoBallPhotoSelections[idx]?.name}」
                              </p>
                            ) : null}
                          </div>

                          <details className="rounded-md border border-dashed border-slate-300 bg-white p-3">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                              {summaryLabel}
                            </summary>
                            <div className="mt-3 space-y-3">
                              <div className="space-y-1">
                                <Label htmlFor={`infoball-event-${idx}`}>事件</Label>
                                <Select
                                  value={String(faceEvent.id)}
                                  onValueChange={(value) => handleEventTypeChange(idx, Number(value))}
                                >
                                  <SelectTrigger id={`infoball-event-${idx}`} className="w-48">
                                    <SelectValue placeholder="選擇事件" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EVENT_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={String(option.value)}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-3">
                                {faceEvent.actions.length === 0 ? (
                                  <p className="text-xs text-slate-500">尚未設定動作，點選下方按鈕新增。</p>
                                ) : null}
                                {faceEvent.actions.map((action, actionIndex) => {
                                  const fieldConfigs = getActionFieldConfigs(action.id);
                                  const knownKeys = new Set(fieldConfigs.map((field) => field.key));
                                  const extraKeys = Object.keys(action.values ?? {}).filter((key) => !knownKeys.has(key));
                                  return (
                                    <div key={`infoball-action-${idx}-${actionIndex}`} className="space-y-2 rounded-md border border-slate-200 p-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-semibold text-slate-500">動作 {actionIndex + 1}</span>
                                        <Select
                                          value={String(action.id)}
                                          onValueChange={(value) => handleActionTypeChange(idx, actionIndex, Number(value))}
                                        >
                                          <SelectTrigger className="w-44">
                                            <SelectValue placeholder="選擇動作" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {ACTION_OPTIONS.map((option) => (
                                              <SelectItem key={option.value} value={String(option.value)}>
                                                {option.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700"
                                          onClick={() => handleRemoveAction(idx, actionIndex)}
                                        >
                                          移除
                                        </Button>
                                      </div>

                                      <div className="space-y-2">
                                        {fieldConfigs.map((field) => {
                                          const inputId = `infoball-action-${idx}-${actionIndex}-${field.key}`;
                                          if (field.type === "boolean") {
                                            const checked = Boolean(action.values?.[field.key]);
                                            return (
                                              <div key={field.key} className="flex items-center gap-2">
                                                <Checkbox
                                                  id={inputId}
                                                  checked={checked}
                                                  onCheckedChange={(checkedValue) =>
                                                    handleActionBooleanChange(idx, actionIndex, field.key, Boolean(checkedValue))
                                                  }
                                                />
                                                <Label htmlFor={inputId} className="text-sm text-slate-600">
                                                  {field.label}
                                                </Label>
                                              </div>
                                            );
                                          }

                                          const value = action.values?.[field.key];
                                          const inputType = field.type === "number" ? "number" : field.type === "url" ? "url" : "text";
                                          return (
                                            <div key={field.key} className="space-y-1">
                                              <Label htmlFor={inputId}>{field.label}</Label>
                                              <Input
                                                id={inputId}
                                                type={inputType}
                                                value={value === null || value === undefined ? "" : String(value)}
                                                onChange={(event) =>
                                                  handleActionFieldChange(idx, actionIndex, field, event.target.value)
                                                }
                                                placeholder={field.placeholder}
                                              />
                                            </div>
                                          );
                                        })}

                                        {extraKeys.map((key) => {
                                          const inputId = `infoball-action-${idx}-${actionIndex}-custom-${key}`;
                                          return (
                                            <div key={key} className="space-y-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <Label htmlFor={inputId}>{key}</Label>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="text-red-600 hover:text-red-700"
                                                  onClick={() => handleRemoveCustomField(idx, actionIndex, key)}
                                                >
                                                  移除
                                                </Button>
                                              </div>
                                              <Input
                                                id={inputId}
                                                value={
                                                  action.values?.[key] === null || action.values?.[key] === undefined
                                                    ? ""
                                                    : String(action.values?.[key])
                                                }
                                                onChange={(event) =>
                                                  handleCustomFieldValueChange(idx, actionIndex, key, event.target.value)
                                                }
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleAddCustomActionField(idx, actionIndex)}
                                        >
                                          新增自訂欄位
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                                <Button type="button" variant="outline" size="sm" onClick={() => handleAddAction(idx)}>
                                  新增動作
                                </Button>
                              </div>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">預覽</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>倍率 {(infoBallPreviewZoom * 100).toFixed(0)}%</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" type="button" onClick={() => adjustPreviewZoom(-0.1)}>
                        縮小
                      </Button>
                      <Button variant="outline" size="sm" type="button" onClick={resetPreviewZoom}>
                        重設
                      </Button>
                      <Button variant="outline" size="sm" type="button" onClick={() => adjustPreviewZoom(0.1)}>
                        放大
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">以下為簡易 3D 預覽，用於檢查層級與圖片順序。可使用按鈕或滑鼠滾輪調整縮放。</p>
                <InfoBallPreview
                  config={{
                    floorCount: infoBallFloorCount,
                    faceCount: infoBallFaceCount,
                    faceWidth: infoBallFaceWidth,
                    floorHeight: infoBallFloorHeight,
                    faceGap: infoBallFaceGap,
                    floorGap: infoBallFloorGap,
                    floorAngles: infoBallFloorAngles,
                    faceGapList: infoBallFaceGapList,
                    speed: infoBallSpeed,
                  }}
                  photos={infoBallPhotos}
                  zoom={infoBallPreviewZoom}
                  onZoomChange={(value) => setInfoBallPreviewZoom(clampPreviewZoom(value))}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">生成 JSON</h3>
                  <Button variant="outline" size="sm" type="button" onClick={handleCopyInfoBallJson}>
                    複製 JSON
                  </Button>
                </div>
                <Textarea value={infoBallJsonString} readOnly className="min-h-[240px] font-mono text-xs" />
              </div>

              <p className="text-xs text-slate-500">JSON 已整合 sub_events，可於上方每個面設定事件與動作。</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ffmpeg">
          <Card>
            <CardHeader>
              <CardTitle>FFmpeg Job</CardTitle>
              <CardDescription>對上傳的影音檔執行轉檔或壓縮。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={submitFfmpeg}>
                <div className="space-y-2">
                  <Label>壓縮策略</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={ffmpegRateStrategy === "crf" ? "default" : "outline"}
                      onClick={() => setFfmpegRateStrategy("crf")}
                    >
                      CRF（建議）
                    </Button>
                    <Button
                      type="button"
                      variant={ffmpegRateStrategy === "bitrate" ? "default" : "outline"}
                      onClick={() => setFfmpegRateStrategy("bitrate")}
                    >
                      指定 Bitrate
                    </Button>
                    <Button
                      type="button"
                      variant={ffmpegRateStrategy === "targetSize" ? "default" : "outline"}
                      onClick={() => setFfmpegRateStrategy("targetSize")}
                      disabled={!videoDurationSeconds}
                    >
                      目標檔案大小
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    CRF 數值越高壓縮越強（常用 26–28 約原始大小的 40–60%）。若使用目標檔案大小，會依影片長度自動計算 bitrate。
                  </p>
                </div>

                {ffmpegRateStrategy === "crf" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ffmpeg-crf">CRF 數值</Label>
                      <Input
                        id="ffmpeg-crf"
                        type="number"
                        min={0}
                        max={51}
                        value={ffmpegCrf}
                        onChange={(event) => setFfmpegCrf(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ffmpeg-preset">Preset</Label>
                      <Input
                        id="ffmpeg-preset"
                        placeholder="slow / medium / fast"
                        value={ffmpeg.preset ?? ""}
                        onChange={(event) => setFfmpeg((prev) => ({ ...prev, preset: event.target.value }))}
                      />
                    </div>
                  </div>
                ) : null}

                {ffmpegRateStrategy === "bitrate" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ffmpeg-bitrate">視訊 Bitrate (kbps)</Label>
                      <Input
                        id="ffmpeg-bitrate"
                        type="number"
                        value={manualBitrateKbps}
                        onChange={(event) => setManualBitrateKbps(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ffmpeg-audio-bitrate">音訊 Bitrate (kbps)</Label>
                      <Input
                        id="ffmpeg-audio-bitrate"
                        type="number"
                        value={audioBitrateKbps}
                        onChange={(event) => setAudioBitrateKbps(Number(event.target.value))}
                      />
                    </div>
                  </div>
                ) : null}

                {ffmpegRateStrategy === "targetSize" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="ffmpeg-target-size">目標檔案大小 (MB)</Label>
                        <Input
                          id="ffmpeg-target-size"
                          type="number"
                          value={targetSizeMb}
                          min={1}
                          onChange={(event) => setTargetSizeMb(Number(event.target.value))}
                          disabled={!videoDurationSeconds}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ffmpeg-audio-bitrate-target">音訊 Bitrate (kbps)</Label>
                        <Input
                          id="ffmpeg-audio-bitrate-target"
                          type="number"
                          value={audioBitrateKbps}
                          onChange={(event) => setAudioBitrateKbps(Number(event.target.value))}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {videoDurationSeconds ? (
                        computedTargetBitrate ? (
                          <>預估總 bitrate {computedTargetBitrate.totalKbps.toLocaleString()} kbps，視訊 bitrate {computedTargetBitrate.videoKbps.toLocaleString()} kbps。</>
                        ) : (
                          "請輸入大於 0 的目標大小。"
                        )
                      ) : (
                        "需要影片長度 (duration) 才能計算目標大小。"
                      )}
                    </p>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="ffmpeg-format">輸出格式</Label>
                    <Input
                      id="ffmpeg-format"
                      value={ffmpeg.targetFormat}
                      onChange={(event) =>
                        setFfmpeg((prev) => ({
                          ...prev,
                          targetFormat: event.target.value as FFmpegOptions["targetFormat"],
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ffmpeg-faststart">Fast Start</Label>
                    <select
                      id="ffmpeg-faststart"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                      value={ffmpeg.fastStart ? "yes" : "no"}
                      onChange={(event) => setFfmpeg((prev) => ({ ...prev, fastStart: event.target.value === "yes" }))}
                    >
                      <option value="yes">啟用 (建議)</option>
                      <option value="no">停用</option>
                    </select>
                  </div>
                </div>

                <Button type="submit" disabled={createJob.isPending || selectedIds.length === 0}>
                  {createJob.isPending ? "Submitting…" : "Create FFmpeg job"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload to Scene</CardTitle>
              <CardDescription>批次將上傳檔案轉成 AR 物件並指定 Scene。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={submitUploadToScene}>
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
                  <Label htmlFor="scene-name">Name</Label>
                  <Input
                    id="scene-name"
                    value={sceneName}
                    onChange={(event) => setSceneName(event.target.value)}
                    placeholder="Enter AR object name"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!sceneId || !sceneName || uploadingToScene || selectedIds.length === 0}
                >
                  {uploadingToScene ? "Uploading…" : "Upload"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    <GalleryAssetPicker
      open={infoBallPhotoPickerOpen}
      onOpenChange={(open) => {
        setInfoBallPhotoPickerOpen(open);
        if (!open) {
          setInfoBallPhotoPickerIndex(null);
        }
      }}
      onSelect={(asset) => {
        if (infoBallPhotoPickerIndex == null) return;
        setInfoBallPhotos((prev) => {
          const next = prev.slice();
          next[infoBallPhotoPickerIndex] = asset.url;
          return next;
        });
        setInfoBallPhotoSelections((prev) => {
          const next = prev.slice();
          next[infoBallPhotoPickerIndex] = { id: asset.id, name: asset.name };
          return next;
        });
      }}
      selectedAssetId={
        infoBallPhotoPickerIndex != null
          ? infoBallPhotoSelections[infoBallPhotoPickerIndex]?.id ?? undefined
          : undefined
      }
      title="選擇 Gallery 圖片"
      description="從 Gallery 中挑選圖片並自動填入 URL。"
    />
    </>
  );
}
