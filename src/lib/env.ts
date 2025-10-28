const DEFAULT_LIG_BASE_URL = "https://api.lig.com.tw";
const DEFAULT_API_BASE = "/api";

export const env = {
  ligBaseUrl: process.env.LIG_BASE_URL ?? DEFAULT_LIG_BASE_URL,
  apiBase: process.env.NEXT_PUBLIC_API_BASE ?? DEFAULT_API_BASE,
  tokenStorage: process.env.TOKEN_STORAGE ?? "localStorage",
};
