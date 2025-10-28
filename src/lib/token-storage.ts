'use client';

const STORAGE_KEY = "assets-studio-token";

type StorageBackend = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function resolveStorage(): StorageBackend | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  const storage = resolveStorage();
  if (!storage) return null;
  return storage.getItem(STORAGE_KEY);
}

export function setToken(token: string) {
  const storage = resolveStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, token);
}

export function clearToken() {
  const storage = resolveStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
}

