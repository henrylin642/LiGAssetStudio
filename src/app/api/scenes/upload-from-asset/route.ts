import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, forwardJson, ligFetch } from "../../_lib/lig-client";

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const body = await request.json();
  const assetId = body?.assetId as string | undefined;
  const sceneId = body?.sceneId as number | undefined;
  const name = body?.name as string | undefined;

  if (!assetId || !sceneId || !name) {
    return NextResponse.json(
      { error: "assetId, sceneId and name are required" },
      { status: 400 },
    );
  }

  const payload = {
    name,
    scene_id: sceneId,
  };

  const upstream = await ligFetch(`/api/v1/ar_objects/from_asset/${assetId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const responseBody = await forwardJson(upstream);

  if (!upstream.ok) {
    return NextResponse.json(responseBody ?? { error: "Upload failed" }, { status: upstream.status });
  }

  return NextResponse.json({ assetId, sceneId, name, result: responseBody ?? null });
}

