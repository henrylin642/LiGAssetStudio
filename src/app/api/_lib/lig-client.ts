import { NextRequest } from "next/server";

const DEFAULT_LIG_BASE_URL = "https://api.lig.com.tw";

const LIG_BASE_URL = process.env.LIG_BASE_URL ?? DEFAULT_LIG_BASE_URL;

export function extractBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const match = authHeader.match(/Bearer\\s+(.*)/i);
  return match?.[1] ?? authHeader;
}

export async function ligFetch(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const url = `${LIG_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    headers,
  });
}

export async function forwardJson(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await response.text();

  if (!contentType.includes("json")) {
    if (text) {
      console.warn("Upstream responded with non-JSON payload", {
        contentType,
        preview: text.slice(0, 120),
      });
    }
    return null;
  }

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn("Failed to parse upstream JSON", {
      error,
      preview: text.slice(0, 120),
    });
    return null;
  }
}
