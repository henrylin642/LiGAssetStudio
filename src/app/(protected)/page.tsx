"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenePicker } from "@/components/scene-picker";
import { BatchDrawer } from "@/components/batch-drawer";
import { FilterBar } from "@/components/gallery/filter-bar";
import { AssetGrid } from "@/components/gallery/asset-grid";
import { TypeTabs } from "@/components/type-tabs";
import { ErrorBanner } from "@/components/error-banner";
import { useAssetsQuery } from "@/hooks/use-assets";
import { useScenesQuery } from "@/hooks/use-scenes";
import { useCreateJobMutation } from "@/hooks/use-jobs";
import { useApi } from "@/hooks/use-api";
import type { Asset, AssetType } from "@/types/dto";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadAsset, setUploadAsset] = useState<Asset | null>(null);
  const [sceneId, setSceneId] = useState<number>();
  const [sceneName, setSceneName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [assetUploadOpen, setAssetUploadOpen] = useState(false);
  const [assetUploadFile, setAssetUploadFile] = useState<File | null>(null);
  const [assetUploadTags, setAssetUploadTags] = useState("");
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null);
  const api = useApi();

  const assetsQuery = useAssetsQuery({ search, page, perPage, type });
  const scenesQuery = useScenesQuery();
  const createJob = useCreateJobMutation();
  const queryClient = useQueryClient();

  const assetUploadMutation = useMutation<
    unknown,
    Error,
    {
      file: File;
      tags: string;
    }
  >({
    mutationFn: async ({ file, tags }) => {
      const base64 = await readFileAsBase64(file);
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const tagList = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const payload = {
        assets: [
          {
            data: base64,
            ext,
            filename: file.name,
            tags: tagList,
          },
        ],
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
    setAssetUploadFile(null);
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
    const file = event.target.files?.[0] ?? null;
    setAssetUploadFile(file);
    setAssetUploadError(null);
    assetUploadMutation.reset();
    event.target.value = "";
  }

  async function handleAssetUploadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assetUploadFile) {
      setAssetUploadError("請先選擇檔案");
      return;
    }
    setAssetUploadError(null);
    assetUploadMutation.reset();
    try {
      await assetUploadMutation.mutateAsync({ file: assetUploadFile, tags: assetUploadTags });
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

  const { data: assetPage, isLoading, error } = assetsQuery;

  const assets = assetPage?.items ?? [];
  const totalPages = useMemo(() => {
    if (!assetPage) return 1;
    return Math.max(1, Math.ceil(assetPage.total / assetPage.pageSize));
  }, [assetPage]);

  function toggleAsset(assetId: string, shouldSelect: boolean) {
    setSelected((previous) => {
      const set = new Set(previous);
      if (shouldSelect) {
        set.add(assetId);
      } else {
        set.delete(assetId);
      }
      return Array.from(set);
    });
  }

  async function handleCreateJob(payload: Parameters<typeof createJob.mutateAsync>[0]) {
    await createJob.mutateAsync(payload);
    setSelected([]);
  }

  async function handleUploadToScene(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadAsset || !sceneId || !sceneName) return;
    setUploading(true);
    try {
      await api("/scenes/upload-from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId: uploadAsset.id, sceneId, name: sceneName }),
      });
      setUploadAsset(null);
      setSceneId(undefined);
      setSceneName("");
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
              <Input id="gallery-asset-file" type="file" onChange={handleAssetFileChange} />
              <p className="text-xs text-slate-500">
                {assetUploadFile ? `${assetUploadFile.name} · ${formatBytes(assetUploadFile.size)}` : "支援圖片、影音與 3D 模型（png/jpg/webp、mp4/webm、glb 等）。"}
              </p>
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
              <Button type="submit" disabled={!assetUploadFile || assetUploadMutation.isPending}>
                {assetUploadMutation.isPending ? "Uploading…" : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(uploadAsset)} onOpenChange={(open) => !open && setUploadAsset(null)}>
        <SheetContent>
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
