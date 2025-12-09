"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
      return {
        ...object,
        mediaInfo: {
          ...object.mediaInfo,
          width: measured?.width ?? object.mediaInfo.width,
          height: measured?.height ?? object.mediaInfo.height,
        },
      };
    });
  }, [normalizedObjects, measuredMedia]);

  useEffect(() => {
    const requiredKeys = new Set<string>();

    displayObjects.forEach((object) => {
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
  }, [displayObjects, handleMediaDimensionsChange]);

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
    if (!replaceAssetType) return "媒體";
    if (replaceAssetType === "image") return "圖片";
    if (replaceAssetType === "video") return "影片";
    if (replaceAssetType === "model") return "3D 模型";
    if (replaceAssetType === "audio") return "音訊";
    return "媒體";
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
            無預覽
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
      setReplaceError("無法辨識此物件的媒體類型，無法更換。");
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
        setReplaceError("只能以相同類型的 Gallery 資產進行更換。");
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
          throw new Error((body as { error?: string }).error ?? "更換失敗，請稍後再試。");
        }
        await sceneObjectsQuery.refetch();
      } catch (error) {
        if (error instanceof Error) {
          setReplaceError(error.message);
        } else {
          setReplaceError("更換失敗，請稍後再試。");
        }
      } finally {
        setReplacing(false);
        setReplacePickerOpen(false);
        setReplaceTarget(null);
      }
    },
    [api, buildReplacementPayload, replaceTarget, sceneObjectsQuery],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scene View</h1>
          <p className="text-sm text-slate-500">
            將 Scene 的所有 AR 物件放入 3D 場景，依照座標與旋轉呈現。圖片會先正規化成長邊 1m，再套用 zoom。
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>選擇 Scene</CardTitle>
          <CardDescription>載入後即可在下方 3D 介面檢視所有物件。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <ScenePicker
                scenes={scenesQuery.data ?? []}
                value={selectedSceneId}
                onChange={(next) => handleSceneChange(next)}
                placeholder="選擇 Scene"
              />
            </div>
            <Button
              type="button"
              onClick={() => sceneObjectsQuery.refetch()}
              disabled={!selectedSceneId || sceneObjectsQuery.isFetching}
            >
              {sceneObjectsQuery.isFetching ? "載入中" : "載入物件"}
            </Button>
          </div>
          {selectedSceneId ? (
            <p className="text-xs text-slate-500">
              Scene #
              {selectedSceneId}
              {sceneName ? <> · {sceneName}</> : null} · 共 {displayObjects.length} 個物件
            </p>
          ) : (
            <p className="text-xs text-slate-500">請選擇 Scene。</p>
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
            <CardContent className="py-12 text-center text-sm text-slate-500">正在載入 Scene 物件…</CardContent>
          </Card>
        ) : displayObjects.length > 0 ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>3D 場景</CardTitle>
                <CardDescription>
                  拖曳旋轉、滾輪縮放。Origin 顯示為 (0,0,0)，方格為 1m × 1m。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SceneViewer
                  objects={normalizedObjects}
                  mediaMeasurements={measuredMedia}
                  onMediaDimensionsChange={handleMediaDimensionsChange}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>物件列表</CardTitle>
                <CardDescription>座標與旋轉為 LiG Cloud 原始值，並附上資源格式與原始尺寸。</CardDescription>
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
                      <th className="px-3 py-2 text-left">更換內容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayObjects.map((object) => (
                      <tr key={object.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-2 align-middle">{renderObjectPreview(object)}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{object.id}</td>
                        <td className="px-3 py-2 text-slate-900">{object.name ?? "—"}</td>
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
                          {`${object.location.x.toFixed(3)}, ${object.location.y.toFixed(3)}, ${object.location.z.toFixed(3)}`}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          {`${object.location.rotate_x.toFixed(1)}, ${object.location.rotate_y.toFixed(1)}, ${object.location.rotate_z.toFixed(1)}`}
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                          {`${object.zoom.x.toFixed(2)}, ${object.zoom.y.toFixed(2)}, ${object.zoom.z.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={replacing || mediaKindToAssetType(object.mediaInfo.kind) === null}
                              onClick={() => handleStartReplace(object)}
                            >
                              {replacing && replaceTarget?.id === object.id ? "更換中…" : "更換內容"}
                            </Button>
                            {mediaKindToAssetType(object.mediaInfo.kind) === null ? (
                              <p className="text-[11px] text-slate-400">無法辨識媒體類型</p>
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
              此 Scene 沒有任何 AR 物件。
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">選擇 Scene 後即可載入視覺化。</CardContent>
        </Card>
      )}

      <GalleryAssetPicker
        open={replacePickerOpen}
        onOpenChange={handleReplaceOpenChange}
        onSelect={handleSelectReplacement}
        type={replaceAssetType ?? "image"}
        title={`選擇${replaceTypeLabel}`}
        description={`僅能以 ${replaceTypeLabel} 資產替換目前物件`}
      />
    </div>
  );
}
