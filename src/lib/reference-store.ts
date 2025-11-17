import { randomUUID } from "crypto";

export type ReferenceAsset = {
  id: string;
  filename: string;
  mimeType: string;
  data: string; // base64
  createdAt: string;
};

const STORE_KEY = "__ASSETS_STUDIO_REFERENCE_STORE__";

type ReferenceStore = {
  items: Map<string, ReferenceAsset>;
};

function getStore(): ReferenceStore {
  const globalAny = globalThis as unknown as Record<string, ReferenceStore | undefined>;
  if (!globalAny[STORE_KEY]) {
    globalAny[STORE_KEY] = { items: new Map() };
  }
  return globalAny[STORE_KEY]!;
}

export function saveReferenceAsset(input: { filename: string; mimeType: string; data: string }) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const record: ReferenceAsset = {
    id,
    filename: input.filename,
    mimeType: input.mimeType,
    data: input.data,
    createdAt,
  };
  getStore().items.set(id, record);
  return record;
}

export function getReferenceAsset(id: string) {
  return getStore().items.get(id) ?? null;
}
