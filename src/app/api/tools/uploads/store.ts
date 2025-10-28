import { randomUUID } from "crypto";
import type { UploadedAsset } from "@/types/dto";

type UploadStore = {
  items: Map<string, UploadedAsset & { data?: string }>;
};

const STORE_KEY = "__ASSETS_STUDIO_UPLOAD_STORE__";

function getStore(): UploadStore {
  const globalAny = globalThis as unknown as Record<string, UploadStore | undefined>;
  if (!globalAny[STORE_KEY]) {
    globalAny[STORE_KEY] = {
      items: new Map(),
    };
  }
  return globalAny[STORE_KEY]!;
}

export function listUploads(): UploadedAsset[] {
  return Array.from(getStore().items.values())
    .map((record) => {
      const { data, ...rest } = record;
      void data;
      return rest;
    })
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function createUploads(
  files: { name: string; type: string; size: number; dataUri?: string; meta?: Record<string, unknown> }[],
): UploadedAsset[] {
  const store = getStore();
  const createdAt = new Date().toISOString();
  const uploads: UploadedAsset[] = files.map((file) => {
    const id = randomUUID();
    const record = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt,
      data: file.dataUri,
      meta: file.meta,
    };
    store.items.set(id, record);
    return {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      createdAt,
      meta: file.meta,
    };
  });
  return uploads;
}

export function deleteUpload(id: string) {
  const store = getStore();
  store.items.delete(id);
}
