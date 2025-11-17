import { NextRequest, NextResponse } from "next/server";
import type { ArObject } from "@/types/dto";
import { extractBearerToken, forwardJson, ligFetch } from "../../../_lib/lig-client";

function normalizeArObjects(payload: unknown): ArObject[] {
  if (Array.isArray(payload)) {
    return payload as ArObject[];
  }

  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    const possibleKeys = ["ar_objects", "objects", "items", "data"];

    for (const key of possibleKeys) {
      if (Array.isArray(root[key])) {
        return root[key] as ArObject[];
      }
    }

    const data = root.data;
    if (data && typeof data === "object") {
      const dataRoot = data as Record<string, unknown>;
      for (const key of possibleKeys) {
        if (Array.isArray(dataRoot[key])) {
          return dataRoot[key] as ArObject[];
        }
      }
    }
  }

  return [];
}

export async function GET(request: NextRequest, context: { params: Promise<{ sceneId: string }> }) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const { sceneId } = await context.params;
  if (!sceneId || Number.isNaN(Number(sceneId))) {
    return NextResponse.json({ error: "Invalid scene ID" }, { status: 400 });
  }

  const currentUrl = new URL(request.url);
  const perPage = currentUrl.searchParams.get("per_page") ?? "200";
  const page = currentUrl.searchParams.get("page") ?? "1";
  const search = new URLSearchParams({ per_page: perPage, page });

  const upstream = await ligFetch(
    `/api/v1/scenes/${encodeURIComponent(sceneId)}/ar_objects?${search.toString()}`,
    { method: "GET" },
    token,
  );

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstream.ok) {
    const body = await forwardJson(upstream);
    return NextResponse.json(body ?? { error: "Failed to fetch scene objects" }, { status: upstream.status });
  }

  const payload = await forwardJson(upstream);
  const objects = normalizeArObjects(payload);

  return NextResponse.json(objects);
}
