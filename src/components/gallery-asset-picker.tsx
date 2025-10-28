"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAssetsQuery } from "@/hooks/use-assets";
import type { Asset } from "@/types/dto";
import { PreviewImage } from "@/components/preview/preview-image";
import { cn, formatBytes } from "@/lib/utils";

interface GalleryAssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: Asset) => void;
  selectedAssetId?: string;
  title?: string;
  description?: string;
}

const PER_PAGE = 24;

export function GalleryAssetPicker({
  open,
  onOpenChange,
  onSelect,
  selectedAssetId,
  title = "Select image from Gallery",
  description = "Choose an existing Gallery image to fill this slot.",
}: GalleryAssetPickerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const assetsQuery = useAssetsQuery({
    search,
    page,
    perPage: PER_PAGE,
    type: "image",
  });

  const assets = assetsQuery.data?.items ?? [];

  const totalPages = useMemo(() => {
    if (!assetsQuery.data) return 1;
    return Math.max(1, Math.ceil(assetsQuery.data.total / assetsQuery.data.pageSize));
  }, [assetsQuery.data]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPage(1);
      setSearch("");
      setSearchInput("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="max-w-4xl">
        <div className="flex h-full flex-col gap-6">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="搜尋圖片名稱或描述"
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">搜尋</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  setPage(1);
                }}
              >
                清除
              </Button>
            </div>
          </form>

          {assetsQuery.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {assetsQuery.error?.message ?? "載入圖片時發生錯誤。"}
            </p>
          ) : null}

          <div className="flex-1 overflow-y-auto">
            {assetsQuery.isLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">載入中…</div>
            ) : assets.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                找不到符合條件的圖片。
              </div>
            ) : (
              <div className="grid gap-4 pb-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={cn(
                      "flex flex-col gap-3 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500",
                      asset.id === selectedAssetId ? "border-slate-900" : "border-slate-200",
                    )}
                    onClick={() => {
                      onSelect(asset);
                      handleOpenChange(false);
                    }}
                  >
                    <PreviewImage src={asset.previewUrl ?? asset.url} alt={asset.name} />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900 line-clamp-2">{asset.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(asset.size)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
            <span className="text-slate-500">
              第 {page} 頁，共 {totalPages} 頁
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || assetsQuery.isLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                上一頁
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages || assetsQuery.isLoading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                下一頁
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
