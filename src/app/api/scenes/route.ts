import { NextRequest, NextResponse } from "next/server";
import type { Scene } from "@/types/dto";
import { extractBearerToken, forwardJson, ligFetch } from "../_lib/lig-client";

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const upstream = await ligFetch("/api/v1/scenes", { method: "GET" }, token);

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (upstream.status >= 500) {
    return NextResponse.json(
      { error: "Upstream unavailable", status: upstream.status },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const body = await forwardJson(upstream);
    return NextResponse.json(body ?? { error: "Failed to fetch scenes" }, { status: upstream.status });
  }

  const payload = await forwardJson(upstream);
  let items: Scene[] = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    const directScenes = root.scenes;
    if (Array.isArray(directScenes)) {
      items = directScenes as Scene[];
    } else if (Array.isArray(root.items)) {
      items = root.items as Scene[];
    } else if (root.data && typeof root.data === "object") {
      const dataObj = root.data as Record<string, unknown>;
      if (Array.isArray(dataObj.scenes)) {
        items = dataObj.scenes as Scene[];
      } else if (Array.isArray(dataObj.items)) {
        items = dataObj.items as Scene[];
      }
    }
  }

  const normalized = items.map((scene, index) => ({
    id: Number(scene.id ?? index + 1),
    name: scene.name ?? `Scene ${scene.id ?? index + 1}`,
    description: scene.description,
  }));

  return NextResponse.json(normalized);
}
