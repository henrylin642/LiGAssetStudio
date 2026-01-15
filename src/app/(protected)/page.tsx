"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenePicker } from "@/components/scene-picker";
import { BatchDrawer, BatchSceneUploadInput } from "@/components/batch-drawer";
import { FilterBar } from "@/components/gallery/filter-bar";
import { AssetGrid } from "@/components/gallery/asset-grid";
import { TypeTabs } from "@/components/type-tabs";
import { ErrorBanner } from "@/components/error-banner";
import { useAssetsQuery } from "@/hooks/use-assets";
import { useScenesQuery } from "@/hooks/use-scenes";
import { useCreateJobMutation } from "@/hooks/use-jobs";
import { useApi } from "@/hooks/use-api";
import type { Asset, AssetPage, AssetType } from "@/types/dto";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBytes } from "@/lib/utils";

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",").pop() ?? "" : result;
      if (!base64) {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function GalleryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [type, setType] = useState<AssetType | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Record<string, Asset>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadAsset, setUploadAsset] = useState<Asset | null>(null);
  const [sceneId, setSceneId] = useState<number>();
  const [sceneName, setSceneName] = useState("");
  
  // Mass Upload States
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [isRandomPlace, setIsRandomPlace] = useState(false);
  const [lightTagHeight, setLightTagHeight] = useState(1.6);
  const [placementRange, setPlacementRange] = useState(20);

  const [uploading, setUploading] = useState(false);
  const [assetUploadOpen, setAssetUploadOpen] = useState(false);
  const [assetUploadFiles, setAssetUploadFiles] = useState<File[]>([]);
  const [assetUploadTags, setAssetUploadTags] = useState("");
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const api = useApi();
  const assetUploadTotalSize = useMemo(
    () => assetUploadFiles.reduce((total, file) => total + file.size, 0),
    [assetUploadFiles]
  );

  const assetsQuery = useAssetsQuery({ search, page, perPage, type });
  const scenesQuery = useScenesQuery();
  const createJob = useCreateJobMutation();
  const queryClient = useQueryClient();

  const assetUploadMutation = useMutation<
    unknown,
    Error,
    {
      files: File[];
      tags: string;
    }
  >({
    mutationFn: async ({ files, tags }) => {
      if (files.length === 0) {
        throw new Error("請先選擇檔案");
      }
      const tagList = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      const assetsPayload = await Promise.all(
        files.map(async (file) => {
          const base64 = await readFileAsBase64(file);
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
          return {
            data: base64,
            ext,
            filename: file.name,
            tags: tagList,
          };
        })
      );

      const payload = {
        assets: assetsPayload,
      };

      const response = await api("/assets", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = "Failed to upload asset";
        try {
          const body = await response.json();
          if (body?.error && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      try {
        return await response.json();
      } catch {
        return null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  function resetAssetUploadState() {
    setAssetUploadFiles([]);
    setAssetUploadTags("");
    setAssetUploadError(null);
  }

  function handleAssetUploadOpenChange(open: boolean) {
    setAssetUploadOpen(open);
    if (!open) {
      resetAssetUploadState();
      assetUploadMutation.reset();
    }
  }

  function handleAssetFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    setAssetUploadFiles(files);
    setAssetUploadError(null);
    assetUploadMutation.reset();
    event.target.value = "";
  }

  async function handleAssetUploadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (assetUploadFiles.length === 0) {
      setAssetUploadError("請先選擇檔案");
      return;
    }
    setAssetUploadError(null);
    assetUploadMutation.reset();
    try {
      await assetUploadMutation.mutateAsync({ files: assetUploadFiles, tags: assetUploadTags });
      resetAssetUploadState();
      setAssetUploadOpen(false);
    } catch (error) {
      if (error instanceof Error) {
        setAssetUploadError(error.message);
      } else {
        setAssetUploadError("上傳失敗，請稍後再試。");
      }
    }
  }

  const { data, isLoading, error } = assetsQuery;
  const assetPage = data as AssetPage | undefined;

  const assets = assetPage?.items ?? [];
  const totalPages = useMemo(() => {
    if (!assetPage) return 1;
    return Math.max(1, Math.ceil(assetPage.total / assetPage.pageSize));
  }, [assetPage]);

  function toggleAsset(asset: Asset, shouldSelect: boolean) {
    setSelected((previous) => {
      const set = new Set(previous);
      if (shouldSelect) {
        set.add(asset.id);
      } else {
        set.delete(asset.id);
      }
      return Array.from(set);
    });
    setSelectedAssets((previous) => {
      const next = { ...previous };
      if (shouldSelect) {
        next[asset.id] = asset;
      } else {
        delete next[asset.id];
      }
      return next;
    });
  }

  function resetSelection() {
    setSelected([]);
    setSelectedAssets({});
  }

  async function handleCreateJob(payload: Parameters<typeof createJob.mutateAsync>[0]) {
    await createJob.mutateAsync(payload);
    resetSelection();
  }

  function formatSceneName(template: string, assetName: string, index: number) {
    const safeTemplate = template.trim().length > 0 ? template : "{{assetName}}";
    return safeTemplate.replaceAll("{{assetName}}", assetName).replaceAll("{{index}}", String(index));
  }

  async function handleBatchUploadToScene(input: BatchSceneUploadInput) {
    if (!input.sceneId) return;
    const startIndex = Number.isFinite(input.startIndex) ? input.startIndex : 1;
    const uploads = input.assetIds
      .map((assetId, offset) => {
        const asset = selectedAssets[assetId];
        if (!asset) return null;
        const name = formatSceneName(input.nameTemplate, asset.name, startIndex + offset);
        return { assetId: asset.id, name };
      })
      .filter(Boolean) as { assetId: string; name: string }[];

    for (const upload of uploads) {
      await api("/scenes/upload-from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId: upload.assetId, sceneId: input.sceneId, name: upload.name }),
      });
    }

    resetSelection();
  }

  async function handleUploadToScene(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadAsset || !sceneId || !sceneName) return;
    setUploading(true);
    try {
      const count = Math.max(1, duplicateCount);
      const isRandom = isRandomPlace;
      
      for (let i = 0; i < count; i++) {
        // Step 1: Create AR Object in Scene
        let arObjectId: string | null = null;
        
        const uploadRes = await api("/scenes/upload-from-asset", {
          method: "POST",
          body: JSON.stringify({ assetId: uploadAsset.id, sceneId, name: sceneName }),
        });

        if (uploadRes.ok) {
             // Try to get ID from response first (if they fix API later)
             try {
                const uploadData = await uploadRes.json();
                const objectData = uploadData.result || uploadData;
                if (objectData && typeof objectData.id === 'number') arObjectId = String(objectData.id);
                else if (objectData && typeof objectData.id === 'string') arObjectId = objectData.id;
             } catch (e) { /* ignore */ }
        }

        // If not found in response, fallback to fetching scene objects and picking latest
        // Retry logic to handle potential race condition where object creation is slow to appear in list
        if (!arObjectId) {
             let retries = 3;
             while (retries > 0 && !arObjectId) {
                 try {
                     const objectsRes = await api(`/scenes/${sceneId}/objects`);
                     if (objectsRes.ok) {
                         const objects = (await objectsRes.json()) as ArObject[];
                         if (Array.isArray(objects) && objects.length > 0) {
                             const candidates = objects.filter(o => o.name === sceneName);
                             const targetList = candidates.length > 0 ? candidates : objects;
                             
                             // Sort descending by ID
                             targetList.sort((a, b) => b.id - a.id);
                             
                             if (targetList.length > 0) {
                                 // Check if this object was created recently (optional heuristic, or just trust ID)
                                 arObjectId = String(targetList[0].id);
                                 console.log(`Fallback: Found latest object ID ${arObjectId} for scene ${sceneId}`);
                             }
                         }
                     }
                 } catch (e) {
                     console.error("Failed to fetch scene objects for fallback ID resolution:", e);
                 }
                 
                 if (!arObjectId) {
                     retries--;
                     if (retries > 0) await new Promise(res => setTimeout(res, 500)); // Wait 500ms before retry
                 }
             }
        }

        if (!arObjectId) {
             console.error("Could not determine AR Object ID after retries. Skipping update.");
             continue;
        }

        // Fetch the current object state to ensure we have a valid base for update
        let currentObject: any = null;
        try {
            const getRes = await api(`/ar_objects/${arObjectId}`);
            if (getRes.ok) {
                const getData = await getRes.json();
                currentObject = getData.result || getData; // handle potential wrapper
            }
        } catch (e) {
            console.error("Failed to fetch new AR Object:", e);
        }

        // Calculate Random Position
        // x: -range/2 to range/2
        // y: -lightTagHeight
        // z: 0 to range
        const x = (Math.random() - 0.5) * placementRange;
        const y = -lightTagHeight;
        const z = Math.random() * placementRange;
        
        const rotateX = Math.random() * 360;
        const rotateZ = Math.random() * 360;
        const rotateY = 0; // Fixed as per requirements

        const newLocation = {
            x,
            y,
            z,
            rotate_x: rotateX,
            rotate_y: rotateY,
            rotate_z: rotateZ,
        };

        // Construct update body. 
        let updateBody: any = {};
        
        if (currentObject) {
             updateBody = { ...currentObject };
             updateBody.location = newLocation;
        } else {
             updateBody = {
                location: newLocation
             };
        }

        try {
            const updateRes = await api(`/ar_objects/${arObjectId}`, {
                method: "POST",
                body: JSON.stringify(updateBody)
            });
            if (!updateRes.ok) {
                 console.error("Failed to update location:", await updateRes.text());
            }
        } catch (e) {
            console.error("Exception during location update:", e);
        }
      }

      setUploadAsset(null);
      setSceneId(undefined);
      setSceneName("");
      // Reset to defaults
      setDuplicateCount(1);
      setIsRandomPlace(false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">Gallery</h1>
          <p className="text-sm text-slate-500">
            Browse LIG assets and prepare batch jobs across {assetPage?.total ?? "…"} media files.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="inline-flex items-center gap-2"
            onClick={() => handleAssetUploadOpenChange(true)}
          >
            <Upload className="h-4 w-4" />
            Upload asset
          </Button>
          <Button onClick={() => setDrawerOpen(true)} disabled={selected.length === 0}>
            Batch actions ({selected.length})
          </Button>
        </div>
      </div>

      <TypeTabs value={type} onValueChange={(next) => setType(next)} />

      <FilterBar
        initialSearch={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        perPage={perPage}
        onPerPageChange={(value) => {
          setPerPage(value);
          setPage(1);
        }}
      />

      <div className="relative min-h-[200px]">
        {assetsQuery.isFetching && !isLoading ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-lg ring-1 ring-slate-900/10">
              <svg
                className="h-4 w-4 animate-spin text-slate-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-sm font-medium text-slate-700">Loading...</span>
            </div>
          </div>
        ) : null}

        {error ? <ErrorBanner message={error.message} /> : null}
        {assetPage?.items?.length === 0 && !isLoading && !error ? (
          <ErrorBanner message="找不到任何資產，可能是 API 返回空清單或發生 502 錯誤。" />
        ) : null}

        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading assets…</div>
        ) : (
          <AssetGrid
            assets={assets}
            selectedIds={selected}
            onToggleAsset={toggleAsset}
            onUploadFromCard={(asset) => {
              setUploadAsset(asset);
              setSceneName(asset.name);
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4 text-sm">
        <span className="text-slate-500">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <BatchDrawer
        assetIds={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreateJob={handleCreateJob}
        onUploadToScene={handleBatchUploadToScene}
        scenes={scenesQuery.data ?? []}
        scenesLoading={scenesQuery.isLoading}
      />

      <Sheet open={assetUploadOpen} onOpenChange={handleAssetUploadOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Upload asset</SheetTitle>
            <SheetDescription>將檔案上傳至 Gallery，系統會透過 LiG API 建立資產。</SheetDescription>
          </SheetHeader>
          <form className="flex flex-1 flex-col gap-4 py-4" onSubmit={handleAssetUploadSubmit}>
            <div className="space-y-2">
              <Label htmlFor="gallery-asset-file">檔案</Label>
              <Input id="gallery-asset-file" type="file" multiple onChange={handleAssetFileChange} />
              {assetUploadFiles.length > 0 ? (
                <div className="space-y-1 text-xs text-slate-500">
                  <p>
                    {assetUploadFiles.length} 檔案 · {formatBytes(assetUploadTotalSize)}
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {assetUploadFiles.slice(0, 5).map((file) => (
                      <li key={`${file.name}-${file.size}`}>{file.name}</li>
                    ))}
                    {assetUploadFiles.length > 5 ? (
                      <li>… 以及 {assetUploadFiles.length - 5} 個檔案</li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  支援圖片、影音與 3D 模型（png/jpg/webp、mp4/webm、glb 等）。
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="gallery-asset-tags">Tags（以逗號分隔，可留空）</Label>
              <Input
                id="gallery-asset-tags"
                value={assetUploadTags}
                onChange={(event) => setAssetUploadTags(event.target.value)}
                placeholder="tag1,tag2"
              />
            </div>
            {assetUploadError ? <p className="text-xs text-red-600">{assetUploadError}</p> : null}
            <SheetFooter>
              <Button type="submit" disabled={assetUploadFiles.length === 0 || assetUploadMutation.isPending}>
                {assetUploadMutation.isPending ? "Uploading…" : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(uploadAsset)} onOpenChange={(open) => !open && setUploadAsset(null)}>
        <SheetContent className="overflow-y-auto max-h-screen">
          <SheetHeader>
            <SheetTitle>Upload asset to Scene</SheetTitle>
            <SheetDescription>
              Trigger LIG AR object creation for “{uploadAsset?.name ?? ""}”.
            </SheetDescription>
          </SheetHeader>
          <form className="flex flex-1 flex-col gap-4 py-4" onSubmit={handleUploadToScene}>
            <div className="space-y-2">
              <Label>Scene</Label>
              <ScenePicker
                scenes={scenesQuery.data ?? []}
                value={sceneId}
                onChange={setSceneId}
                placeholder={scenesQuery.isLoading ? "Loading scenes…" : "Select scene"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sceneName">AR object name</Label>
              <Input
                id="sceneName"
                value={sceneName}
                onChange={(event) => setSceneName(event.target.value)}
                placeholder="Enter AR object name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="duplicateCount">Duplicate Number</Label>
                    <Input
                        id="duplicateCount"
                        type="number"
                        min={1}
                        value={duplicateCount}
                        onChange={(e) => setDuplicateCount(Number(e.target.value))}
                    />
                </div>
            </div>

            <div className="flex items-center space-x-2 border p-2 rounded-md">
                <Checkbox 
                    id="randomPlace" 
                    checked={isRandomPlace}
                    onCheckedChange={(checked) => setIsRandomPlace(checked === true)}
                />
                <Label htmlFor="randomPlace">Random Place</Label>
            </div>

            {isRandomPlace && (
                <div className="grid grid-cols-2 gap-4 border p-2 rounded-md bg-slate-50">
                    <div className="space-y-2">
                        <Label htmlFor="lightTagHeight">LightTag Height (m)</Label>
                        <Input
                            id="lightTagHeight"
                            type="number"
                            step={0.1}
                            value={lightTagHeight}
                            onChange={(e) => setLightTagHeight(Number(e.target.value))}
                        />
                    </div>
                    <div className="space-y-2">
                         <Label htmlFor="placementRange">Placement Range (m)</Label>
                        <Input
                            id="placementRange"
                            type="number"
                            step={1}
                            value={placementRange}
                            onChange={(e) => setPlacementRange(Number(e.target.value))}
                        />
                    </div>
                </div>
            )}

            <SheetFooter>
              <Button type="submit" disabled={!sceneId || !sceneName || uploading}>
                {uploading ? "Submitting…" : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
