import type { Asset, AssetType } from "@/types/dto";

export type UpstreamAsset = {
  id?: string | number;
  uuid?: string;
  asset_id?: string | number;
  name?: string;
  filename?: string;
  title?: string;
  url?: string;
  file_url?: string;
  download_url?: string;
  thumbnail_url?: string;
  preview_url?: string;
  type?: string;
  asset_type?: string;
  kind?: string;
  category?: string;
  ext?: string;
  extension?: string;
  mime_type?: string;
  size?: number | string;
  file_size?: number | string;
  filesize?: number | string;
  previewUrl?: string;
  [key: string]: unknown;
};

export function inferType(typeSource: string, ext?: string): AssetType {
  if (typeSource.includes("audio") || ext?.match(/mp3|wav|aac|m4a|flac|ogg|oga/)) return "audio";
  if (typeSource.includes("video") || ext?.match(/mp4|mov|m4v|webm|avi|mkv/)) return "video";
  if (typeSource.includes("model") || typeSource.includes("3d") || ext?.match(/gltf|glb|fbx|obj/)) {
    return "model";
  }
  if (typeSource.includes("image")) return "image";
  return "image";
}

export function normalizeAsset(item: UpstreamAsset): Asset | null {
  const id = item.id ?? item.uuid ?? item.asset_id;
  const url = item.url ?? item.file_url ?? item.download_url;
  if (!id || !url) return null;

  const ext = (item.ext ?? item.extension ?? (typeof url === "string" ? url.split(".").pop() : undefined))
    ?.toString()
    .toLowerCase();

  const typeSource = (item.type ?? item.asset_type ?? item.kind ?? item.category ?? ext ?? "image")
    .toString()
    .toLowerCase();

  const type: AssetType = inferType(typeSource, ext);

  const size = Number(item.size ?? item.file_size ?? item.filesize ?? 0) || 0;

  const previewUrl = item.preview_url ?? item.thumbnail_url ?? item.previewUrl ?? undefined;

  const meta = { ...item } as Record<string, unknown>;

  return {
    id: String(id),
    type,
    name: item.name ?? item.filename ?? item.title ?? `Asset ${id}`,
    url: String(url),
    size,
    previewUrl: previewUrl ? String(previewUrl) : undefined,
    ext,
    meta,
  };
}
