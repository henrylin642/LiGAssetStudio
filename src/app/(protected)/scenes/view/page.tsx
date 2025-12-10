"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GalleryAssetPicker } from "@/components/gallery-asset-picker";
import { PreviewImage } from "@/components/preview/preview-image";
import { PreviewAudio } from "@/components/preview/preview-audio";
import { Preview3D } from "@/components/preview/preview-3d";
import { PreviewVideo } from "@/components/preview/preview-video";
import { ScenePicker } from "@/components/scene-picker";
import { SceneViewer } from "@/components/scene-viewer";
import { useScenesQuery } from "@/hooks/use-scenes";
import { useApi } from "@/hooks/use-api";
import type { ArObject, ArObjectTexture, Asset, AssetType } from "@/types/dto";

type MediaInfo = {
  kind: "image" | "video" | "model" | "audio" | "unknown";
  ext?: string;
  width?: number;
  height?: number;
  url?: string;
};

type NormalizedArObject = ArObject & {
  sceneKey: string;
  location: {
    x: number;
    y: number;
    z: number;
    rotate_x: number;
    rotate_y: number;
    rotate_z: number;
  };
  zoom: {
    x: number;
    y: number;
    z: number;
  };
  mediaInfo: MediaInfo;
};

const toNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toObjectKey = (object: ArObject, index: number) => {
  if (object.id !== null && object.id !== undefined) {
    const numeric = Number(object.id);
    if (Number.isFinite(numeric)) {
      return String(numeric);
    }
    return String(object.id);
  }
  if (object.name) {
    return `${object.name}-${index}`;
  }
  return `object-${index}`;
};

const MEDIA_VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"];
const MEDIA_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const MEDIA_MODEL_EXTENSIONS = ["glb", "gltf", "fbx", "obj", "usdz", "stl"];
const MEDIA_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

const mediaKindToAssetType = (kind: MediaInfo["kind"]): AssetType | null => {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "model") return "model";
  if (kind === "audio") return "audio";
  return null;
};

const getAssetDimensions = (asset: Asset) => {
  const meta = asset.meta as
    | {
      width?: number;
      height?: number;
      image?: { width?: number; height?: number };
      video?: { width?: number; height?: number };
    }
    | undefined;
  const candidates = [
    { width: (asset as { width?: number }).width, height: (asset as { height?: number }).height },
    meta?.image,
    meta?.video,
    meta,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return { width: undefined, height: undefined };
};

const inferTextureDimension = (texture: ArObjectTexture | null | undefined) => {
  if (!texture || typeof texture !== "object") return { width: undefined, height: undefined };
  const meta = (texture as { meta?: unknown }).meta as
    | {
      width?: number;
      height?: number;
      image?: { width?: number; height?: number };
      video?: { width?: number; height?: number };
    }
    | undefined;
  const candidates = [
    { width: (texture as { width?: number }).width, height: (texture as { height?: number }).height },
    meta?.image,
    meta?.video,
    meta,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  return { width: undefined, height: undefined };
};

const deriveMediaInfo = (object: ArObject): MediaInfo => {
  const texture = object.model?.texture ?? object.model?.ios_texture ?? object.model?.android_texture ?? undefined;
  const url = texture?.url;
  const ext =
    url
      ?.split("?")[0]
      ?.split(".")
      .pop()
      ?.toLowerCase() ?? undefined;

  let kind: MediaInfo["kind"] = "unknown";
  if (ext) {
    if (MEDIA_VIDEO_EXTENSIONS.includes(ext)) {
      kind = "video";
    } else if (MEDIA_AUDIO_EXTENSIONS.includes(ext)) {
      kind = "audio";
    } else if (MEDIA_IMAGE_EXTENSIONS.includes(ext)) {
      kind = "image";
    } else if (MEDIA_MODEL_EXTENSIONS.includes(ext)) {
      kind = "model";
    }
  }

  const { width, height } = inferTextureDimension(texture);

  return {
    kind,
    ext,
    width,
    height,
    url,
  };
};

export default function SceneViewPage() {
  const [selectedSceneId, setSelectedSceneIdState] = useState<number>();
  const [measuredMedia, setMeasuredMedia] = useState<Record<string, { width?: number; height?: number }>>({});
  const mediaProbeRefs = useRef<Record<string, { cleanup: () => void }>>({});
  const scenesQuery = useScenesQuery();
  const api = useApi();
  const [replaceTarget, setReplaceTarget] = useState<NormalizedArObject | null>(null);
  const [replacePickerOpen, setReplacePickerOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  // Use any to allow string intermediate values for better UX (negative, decimals)
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [appliedEdits, setAppliedEdits] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [lightTagHeight, setLightTagHeight] = useState("1.8");

  const handleMediaDimensionsChange = useCallback(
    (payload: { objectKey: string; width?: number; height?: number }) => {
      if (!payload.objectKey) return;
      setMeasuredMedia((prev) => {
        const existing = prev[payload.objectKey];
        if (existing?.width === payload.width && existing?.height === payload.height) {
          return prev;
        }
        return {
          ...prev,
          [payload.objectKey]: { width: payload.width, height: payload.height },
        };
      });
    },
    [],
  );

  const handleSceneChange = useCallback((next: number | undefined) => {
    setSelectedSceneIdState(next);
    setMeasuredMedia({});
    setEdits({});
    setAppliedEdits({});
  }, []);

  const sceneObjectsQuery = useQuery<ArObject[], Error>({
    queryKey: ["scene", selectedSceneId, "objects"],
    enabled: Boolean(selectedSceneId),
    queryFn: async () => {
      if (!selectedSceneId) return [];
      const response = await api(`/scenes/${selectedSceneId}/objects`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "Failed to load scene objects");
      }
      const data = (await response.json()) as ArObject[];
      return Array.isArray(data) ? data : [];
    },
  });

  const normalizedObjects = useMemo<NormalizedArObject[]>(() => {
    return (sceneObjectsQuery.data ?? []).map((object, index) => {
      const location = object.location ?? {};
      const zoom = object.zoom ?? {};
      const baseMediaInfo = deriveMediaInfo(object);
      const sceneKey = toObjectKey(object, index);
      return {
        ...object,
        sceneKey,
        location: {
          x: toNumber(location.x),
          y: toNumber(location.y),
          z: toNumber(location.z),
          rotate_x: toNumber(location.rotate_x),
          rotate_y: toNumber(location.rotate_y),
          rotate_z: toNumber(location.rotate_z),
        },
        zoom: {
          x: toNumber(zoom.x, 1),
          y: toNumber(zoom.y, 1),
          z: toNumber(zoom.z, 1),
        },
        mediaInfo: baseMediaInfo,
      };
    });
  }, [sceneObjectsQuery.data]);

  const displayObjects = useMemo(() => {
    return normalizedObjects.map((object) => {
      const measured = measuredMedia[object.sceneKey];
      const edit = edits[object.id ?? ""];

      const mergedLocation = {
        ...object.location,
        ...(edit?.location ?? {}),
      };
      const mergedZoom = {
        ...object.zoom,
        ...(edit?.zoom ?? {}),
      };

      return {
        ...object,
        location: mergedLocation,
        zoom: mergedZoom,
        mediaInfo: {
          ...object.mediaInfo,
          width: measured?.width ?? object.mediaInfo.width,
          height: measured?.height ?? object.mediaInfo.height,
        },
      };
    });
  }, [normalizedObjects, measuredMedia, edits]);

  const viewerObjects = useMemo(() => {
    return normalizedObjects.map((object) => {
      const measured = measuredMedia[object.sceneKey];
      const edit = appliedEdits[object.id ?? ""];

      const parseValue = (val: any, fallback: number) => {
        const num = parseFloat(val);
        return Number.isFinite(num) ? num : fallback;
      };

      const mergedLocation = {
        x: parseValue(edit?.location?.x, object.location.x),
        y: parseValue(edit?.location?.y, object.location.y),
        z: parseValue(edit?.location?.z, object.location.z),
        rotate_x: parseValue(edit?.location?.rotate_x, object.location.rotate_x),
        rotate_y: parseValue(edit?.location?.rotate_y, object.location.rotate_y),
        rotate_z: parseValue(edit?.location?.rotate_z, object.location.rotate_z),
      };
      const mergedZoom = {
        x: parseValue(edit?.zoom?.x, object.zoom.x),
        y: parseValue(edit?.zoom?.y, object.zoom.y),
        z: parseValue(edit?.zoom?.z, object.zoom.z),
      };

      return {
        ...object,
        location: mergedLocation,
        zoom: mergedZoom,
        mediaInfo: {
          ...object.mediaInfo,
          width: measured?.width ?? object.mediaInfo.width,
          height: measured?.height ?? object.mediaInfo.height,
        },
      };
    });
  }, [normalizedObjects, measuredMedia, appliedEdits]);

  useEffect(() => {
    const requiredKeys = new Set<string>();

    viewerObjects.forEach((object) => {
      const measured =
        object.mediaInfo.width && object.mediaInfo.width > 1 && object.mediaInfo.height && object.mediaInfo.height > 1;
      const existing = mediaProbeRefs.current[object.sceneKey];

      if (measured || !object.mediaInfo.url) {
        if (existing) {
          existing.cleanup();
          delete mediaProbeRefs.current[object.sceneKey];
        }
        return;
      }

      requiredKeys.add(object.sceneKey);
      if (existing) return;

      const handleReady = (width?: number, height?: number) => {
        if (Number(width) > 1 && Number(height) > 1) {
          handleMediaDimensionsChange({
            objectKey: object.sceneKey,
            width,
            height,
          });
        }
      };

      if (object.mediaInfo.kind === "video") {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.src = object.mediaInfo.url;

        const cleanup = () => {
          video.removeEventListener("loadedmetadata", handleLoaded);
          video.removeEventListener("loadeddata", handleLoaded);
          video.removeEventListener("error", handleError);
          video.removeAttribute("src");
          video.load();
          video.remove();
          delete mediaProbeRefs.current[object.sceneKey];
        };

        const handleLoaded = () => {
          handleReady(video.videoWidth, video.videoHeight);
          cleanup();
        };

        const handleError = () => {
          cleanup();
        };

        video.addEventListener("loadedmetadata", handleLoaded);
        video.addEventListener("loadeddata", handleLoaded);
        video.addEventListener("error", handleError);
        video.load();
        mediaProbeRefs.current[object.sceneKey] = { cleanup };
        return;
      }

      if (object.mediaInfo.kind !== "image" && object.mediaInfo.kind !== "unknown") {
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = object.mediaInfo.url;

      const cleanup = () => {
        img.removeEventListener("load", handleLoad);
        img.removeEventListener("error", handleError);
        img.src = "";
        delete mediaProbeRefs.current[object.sceneKey];
      };

      const handleLoad = () => {
        handleReady(img.naturalWidth, img.naturalHeight);
        cleanup();
      };

      const handleError = () => {
        cleanup();
      };

      img.addEventListener("load", handleLoad);
      img.addEventListener("error", handleError);
      mediaProbeRefs.current[object.sceneKey] = { cleanup };
    });

    Object.keys(mediaProbeRefs.current).forEach((key) => {
      if (!requiredKeys.has(key)) {
        mediaProbeRefs.current[key]?.cleanup();
        delete mediaProbeRefs.current[key];
      }
    });
  }, [viewerObjects, handleMediaDimensionsChange]);

  useEffect(() => {
    return () => {
      Object.values(mediaProbeRefs.current).forEach(({ cleanup }) => cleanup());
      mediaProbeRefs.current = {};
    };
  }, []);

  const sceneName = useMemo(() => {
    if (!selectedSceneId) return null;
    const found = (scenesQuery.data ?? []).find((scene) => scene.id === selectedSceneId);
    return found?.name ?? null;
  }, [scenesQuery.data, selectedSceneId]);

  const replaceAssetType = useMemo<AssetType | null>(() => {
    if (!replaceTarget) return null;
    return mediaKindToAssetType(replaceTarget.mediaInfo.kind);
  }, [replaceTarget]);

  const replaceTypeLabel = useMemo(() => {
    if (!replaceAssetType) return "media";
    if (replaceAssetType === "image") return "image";
    if (replaceAssetType === "video") return "video";
    if (replaceAssetType === "model") return "3D model";
    if (replaceAssetType === "audio") return "audio";
    return "media";
  }, [replaceAssetType]);

  const buildReplacementPayload = useCallback((object: NormalizedArObject, asset: Asset) => {
    const dimensions = getAssetDimensions(asset);
    const applyTexture = (sourceTexture?: ArObjectTexture | null) => {
      const baseMeta = (sourceTexture as { meta?: unknown })?.meta as
        | {
          width?: number;
          height?: number;
          image?: { width?: number; height?: number };
          video?: { width?: number; height?: number };
        }
        | undefined;
      const nextMeta =
        asset.type === "image"
          ? { ...(baseMeta ?? {}), image: { width: dimensions.width, height: dimensions.height } }
          : asset.type === "video"
            ? { ...(baseMeta ?? {}), video: { width: dimensions.width, height: dimensions.height } }
            : baseMeta;

      return {
        ...(sourceTexture ?? {}),
        url: asset.url,
        width: dimensions.width ?? (sourceTexture as { width?: number })?.width,
        height: dimensions.height ?? (sourceTexture as { height?: number })?.height,
        meta: nextMeta,
      };
    };

    const nextTexture = applyTexture(object.model?.texture);
    const nextIosTexture = applyTexture(object.model?.ios_texture);
    const nextAndroidTexture = applyTexture(object.model?.android_texture);

    return {
      name: object.name,
      model: {
        ...(object.model ?? {}),
        texture: nextTexture,
        ios_texture: nextIosTexture,
        android_texture: nextAndroidTexture,
      },
    };
  }, []);

  const renderObjectPreview = useCallback(
    (object: NormalizedArObject) => {
      const url = object.mediaInfo.url;
      const cellWidth = "w-28 sm:w-32";

      if (!url) {
        return (
          <div
            className={`${cellWidth} flex aspect-square items-center justify-center rounded-md border border-dashed border-slate-200 text-[11px] text-slate-400`}
          >
            No Preview
          </div>
        );
      }

      if (object.mediaInfo.kind === "video") {
        return (
          <div className={cellWidth}>
            <PreviewVideo src={url} poster={url} />
          </div>
        );
      }

      if (object.mediaInfo.kind === "model") {
        return (
          <div className={cellWidth}>
            <Preview3D src={url} />
          </div>
        );
      }

      if (object.mediaInfo.kind === "audio") {
        return (
          <div className={`${cellWidth} min-w-[120px]`}>
            <PreviewAudio src={url} />
          </div>
        );
      }

      return (
        <div className={cellWidth}>
          <PreviewImage
            src={url}
            alt={object.name ?? `Object ${object.id}`}
            variant="grid"
            onDimensions={(dimensions) =>
              handleMediaDimensionsChange({
                objectKey: object.sceneKey,
                width: dimensions.width,
                height: dimensions.height,
              })
            }
          />
        </div>
      );
    },
    [handleMediaDimensionsChange],
  );

  const handleStartReplace = useCallback((object: NormalizedArObject) => {
    const targetType = mediaKindToAssetType(object.mediaInfo.kind);
    if (!targetType) {
      setReplaceError("Unable to identify object media type, cannot replace.");
      return;
    }
    setReplaceTarget(object);
    setReplacePickerOpen(true);
    setReplaceError(null);
  }, []);

  const handleReplaceOpenChange = useCallback(
    (nextOpen: boolean) => {
      setReplacePickerOpen(nextOpen);
      if (!nextOpen && !replacing) {
        setReplaceTarget(null);
      }
    },
    [replacing],
  );

  const handleSelectReplacement = useCallback(
    async (asset: Asset) => {
      if (!replaceTarget) return;
      const targetType = mediaKindToAssetType(replaceTarget.mediaInfo.kind);
      if (targetType && asset.type !== targetType) {
        setReplaceError("Can only replace with Gallery assets of the same type.");
        return;
      }

      setReplacing(true);
      setReplaceError(null);
      try {
        const payload = buildReplacementPayload(replaceTarget, asset);
        const response = await api(`/ar-objects/${replaceTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Replacement failed, please try again later.");
        }
        await sceneObjectsQuery.refetch();
      } catch (error) {
        if (error instanceof Error) {
          setReplaceError(error.message);
        } else {
          setReplaceError("Replacement failed, please try again later.");
        }
      } finally {
        setReplacing(false);
        setReplacePickerOpen(false);
        setReplaceTarget(null);
      }
    },
    [api, buildReplacementPayload, replaceTarget, sceneObjectsQuery],
  );

  const handleEdit = useCallback((id: number, field: "location" | "zoom" | "name", axis: string, value: string) => {
    // Allow any input for better UX (e.g. "1.", "-", "")
    setEdits((prev) => {
      const currentEdit = prev[id] ?? {};

      if (field === "name") {
        return {
          ...prev,
          [id]: {
            ...currentEdit,
            name: value
          }
        };
      }

      const group = (currentEdit as any)[field] ?? {};
      return {
        ...prev,
        [id]: {
          ...currentEdit,
          [field]: {
            ...group,
            [axis]: value,
          },
        },
      };
    });
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this object? This action cannot be undone.")) return;
    try {
      const response = await api(`/ar-objects/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Delete failed");
      }
      await sceneObjectsQuery.refetch();
    } catch (e) {
      console.error(e);
      alert("Failed to delete object");
    }
  }, [api, sceneObjectsQuery]);

  const handleSave = useCallback(async () => {
    if (Object.keys(edits).length === 0) return;
    setSaving(true);
    try {
      const promises = Object.entries(edits).map(async ([key, edit]) => {
        const id = Number(key);
        const original = normalizedObjects.find(o => o.id === id);
        if (!original) return;

        // Construct payload merging original with edit
        // We need to send the full body or at least what the API expects.
        // Assuming API handles partial update or we merge everything.
        // Based on `buildReplacementPayload` earlier, we might need to send `model` structure if texturing,
        // but here we are updating location/zoom.
        // Let's assume PATCH supports `location` and `zoom` fields at top level or we check DTO.
        // Looking at `dto.ts` earlier, `ArObject` has `location` and `zoom`.
        // Ideally we just send what changed.

        const payload: Record<string, any> = {};

        // Helper to strip nones/empty - mimicking the Python script
        const stripNones = (value: any): any => {
          if (value === null || value === undefined) return undefined;
          if (Array.isArray(value)) {
            const cleaned = value.map(stripNones).filter(v => v !== undefined);
            return cleaned.length > 0 ? cleaned : undefined;
          }
          if (typeof value === "object") {
            const cleaned: Record<string, any> = {};
            Object.entries(value).forEach(([k, v]) => {
              const cv = stripNones(v);
              if (cv !== undefined && cv !== "" && !(Array.isArray(cv) && cv.length === 0) && !(typeof cv === "object" && Object.keys(cv).length === 0)) {
                cleaned[k] = cv;
              }
            });
            return Object.keys(cleaned).length > 0 ? cleaned : undefined;
          }
          return value === "" ? undefined : value;
        };

        const parseSub = (sub: Record<string, any> | undefined, originalSub: Record<string, number>) => {
          if (!sub) return { ...originalSub };
          const result: Record<string, number> = { ...originalSub };
          Object.entries(sub).forEach(([k, v]) => {
            const str = String(v);
            const parsed = parseFloat(str);
            if (Number.isFinite(parsed)) {
              result[k] = parsed;
            }
          });
          return result;
        };

        const nextLocation = parseSub(edit.location, original.location ?? { x: 0, y: 0, z: 0, rotate_x: 0, rotate_y: 0, rotate_z: 0 });
        const nextZoom = parseSub(edit.zoom, original.zoom ?? { x: 1, y: 1, z: 1 });

        // Construct full payload mimicking Python script structure
        const rawPayload = {
          location: nextLocation,
          zoom: nextZoom,
          model: original.model ?? {},
          transparency: original.transparency ?? 1.0,
          events: original.events ?? [],
          // Include other optional fields if present in original
          name: edit.name ?? original.name, // Use edited name if present
          group: original.group,
          scene_id: original.scene_id,
        };

        // Clean it
        const finalPayload = stripNones(rawPayload) ?? {};

        // Ensure required keys are present even if empty (Python script ensures location/zoom/model/events are dicts/list)
        if (!finalPayload.location) finalPayload.location = nextLocation; // location is always full
        if (!finalPayload.zoom) finalPayload.zoom = nextZoom; // zoom is always full
        if (!finalPayload.model && original.model) finalPayload.model = stripNones(original.model);
        if (!finalPayload.model) finalPayload.model = {};

        console.log("Saving object (full)", id, finalPayload);

        const response = await api(`/ar-objects/${id}`, {
          method: "PATCH",
          body: JSON.stringify(finalPayload),
        });
        if (!response.ok) {
          throw new Error(`Failed to update object ${id}`);
        }
      });

      await Promise.all(promises);
      setEdits({});
      setAppliedEdits({});
      await sceneObjectsQuery.refetch();
    } catch (error) {
      console.error(error);
      alert("Save failed, please check network or try again.");
    } finally {
      setSaving(false);
    }
  }, [api, edits, normalizedObjects, sceneObjectsQuery]);

  const hasEdits = Object.keys(edits).length > 0;

  const handleApplyPreview = useCallback(() => {
    setAppliedEdits(edits);
  }, [edits]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scene View</h1>
          <p className="text-sm text-slate-500">
            Place all AR objects from the Scene into the 3D scene, rendering them according to coordinates and rotation. Images will first be normalized to a long side of 1m before applying zoom.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => scenesQuery.refetch()} disabled={scenesQuery.isRefetching}>
            {scenesQuery.isRefetching ? "Refreshing…" : "Refresh Scenes"}
          </Button>
          <Button
            variant="outline"
            onClick={() => sceneObjectsQuery.refetch()}
            disabled={!selectedSceneId || sceneObjectsQuery.isFetching}
          >
            {sceneObjectsQuery.isFetching ? "Loading…" : "Reload Objects"}
          </Button>
          <Button
            disabled={!hasEdits || saving}
            variant="outline"
            onClick={handleApplyPreview}
          >
            Preview Change
          </Button>
          <Button
            disabled={!hasEdits || saving}
            onClick={handleSave}
            variant={hasEdits ? "default" : "outline"}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a Scene</CardTitle>
          <CardDescription>After loading, you can view all objects in the 3D interface below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <ScenePicker
                scenes={scenesQuery.data ?? []}
                value={selectedSceneId}
                onChange={(next) => handleSceneChange(next)}
                placeholder="Choose a Scene"
              />
            </div>
            <Button
              type="button"
              onClick={() => sceneObjectsQuery.refetch()}
              disabled={!selectedSceneId || sceneObjectsQuery.isFetching}
            >
              {sceneObjectsQuery.isFetching ? "Loading..." : "Load Objects"}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 whitespace-nowrap">Light Tag Height (m):</span>
              <Input
                type="number"
                step="0.1"
                className="w-20"
                value={lightTagHeight}
                onChange={e => setLightTagHeight(e.target.value)}
              />
            </div>
          </div>
          {selectedSceneId ? (
            <p className="text-xs text-slate-500">
              Scene #
              {selectedSceneId}
              {sceneName ? <> · {sceneName}</> : null} · Total of {displayObjects.length} objects
            </p>
          ) : (
            <p className="text-xs text-slate-500">Please choose a Scene.</p>
          )}
        </CardContent>
      </Card>

      {sceneObjectsQuery.isError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {sceneObjectsQuery.error?.message}
        </p>
      ) : null}
      {replaceError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{replaceError}</p>
      ) : null}

      {selectedSceneId ? (
        sceneObjectsQuery.isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">Loading Scene objects...</CardContent>
          </Card>
        ) : displayObjects.length > 0 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>3D Scene</CardTitle>
                <CardDescription>
                  Drag to rotate, scroll to zoom. Origin displayed as (0,0,0), grid is 1m × 1m.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SceneViewer
                  objects={viewerObjects}
                  mediaMeasurements={measuredMedia}
                  onMediaDimensionsChange={handleMediaDimensionsChange}
                  groundHeight={parseFloat(lightTagHeight) || 0}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Object List</CardTitle>
                <CardDescription>Coordinates and rotation are LiG Cloud raw values, accompanied by resource format and original dimensions.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-auto">
                <table className="min-w-full table-fixed border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="w-28 sm:w-32 px-3 py-2 text-left">Preview</th>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Format</th>
                      <th className="px-3 py-2 text-left">Media Info</th>
                      <th className="px-3 py-2 text-left">Position (x,y,z)</th>
                      <th className="px-3 py-2 text-left">Rotate (x°,y°,z°)</th>
                      <th className="px-3 py-2 text-left">Zoom</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayObjects.map((object) => (
                      <tr key={object.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 align-middle">{renderObjectPreview(object)}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{object.id}</td>
                        <td className="px-3 py-2 text-slate-900">
                          <Input
                            className="h-7 px-2 text-xs min-w-[120px]"
                            value={object.name ?? ""}
                            onChange={e => object.id && handleEdit(object.id, 'name', '', e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {object.mediaInfo.kind === "video"
                            ? `Video${object.mediaInfo.ext ? ` (.${object.mediaInfo.ext})` : ""}`
                            : object.mediaInfo.kind === "image"
                              ? `Image${object.mediaInfo.ext ? ` (.${object.mediaInfo.ext})` : ""}`
                              : object.mediaInfo.kind === "model"
                                ? `3D Model${object.mediaInfo.ext ? ` (.${object.mediaInfo.ext})` : ""}`
                                : object.mediaInfo.kind === "audio"
                                  ? `Audio${object.mediaInfo.ext ? ` (.${object.mediaInfo.ext})` : ""}`
                                  : object.mediaInfo.ext
                                    ? `.${object.mediaInfo.ext}`
                                    : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          {object.mediaInfo.width && object.mediaInfo.height
                            ? `${Math.round(object.mediaInfo.width)}×${Math.round(object.mediaInfo.height)} px`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          <div className="flex gap-1 w-24">
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.x}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'x', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.y}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'y', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.z}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'z', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          <div className="flex gap-1 w-24">
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.rotate_x}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'rotate_x', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.rotate_y}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'rotate_y', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.location.rotate_z}
                              onChange={e => object.id && handleEdit(object.id, 'location', 'rotate_z', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          <div className="flex gap-1 w-24">
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.zoom.x}
                              onChange={e => object.id && handleEdit(object.id, 'zoom', 'x', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.zoom.y}
                              onChange={e => object.id && handleEdit(object.id, 'zoom', 'y', e.target.value)}
                            />
                            <Input
                              className="h-6 px-1 text-[10px] w-8"
                              value={object.zoom.z}
                              onChange={e => object.id && handleEdit(object.id, 'zoom', 'z', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={replacing || mediaKindToAssetType(object.mediaInfo.kind) === null}
                              onClick={() => handleStartReplace(object)}
                            >
                              {replacing && replaceTarget?.id === object.id ? "Replacing..." : "Change Object"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs"
                              onClick={() => object.id && handleDelete(object.id)}
                            >
                              Delete
                            </Button>
                            {mediaKindToAssetType(object.mediaInfo.kind) === null ? (
                              <p className="text-[11px] text-slate-400">Unknown media type</p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              This Scene has no AR objects.
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">Select a Scene to load visualization.</CardContent>
        </Card>
      )}

      <GalleryAssetPicker
        open={replacePickerOpen}
        onOpenChange={handleReplaceOpenChange}
        onSelect={handleSelectReplacement}
        type={replaceAssetType ?? "image"}
        title={`Select ${replaceTypeLabel}`}
        description={`Only replace current object with ${replaceTypeLabel} assets`}
      />
    </div>
  );
}
