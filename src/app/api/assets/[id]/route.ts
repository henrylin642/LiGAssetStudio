import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, forwardJson, ligFetch } from "../../_lib/lig-client";
import { normalizeAsset } from "../helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const { id: assetId } = await params;
  const upstream = await ligFetch(`/api/v1/get_asset/${assetId}`, { method: "GET" }, token);

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!upstream.ok) {
    const body = await forwardJson(upstream);
    return NextResponse.json(body ?? { error: "Failed to fetch asset" }, { status: upstream.status });
  }

  const payload = await forwardJson(upstream);
  const asset = payload && typeof payload === "object" ? normalizeAsset(payload) : null;

  if (!asset) {
    return NextResponse.json({ error: "Asset payload malformed" }, { status: 502 });
  }

  return NextResponse.json(asset);
}
