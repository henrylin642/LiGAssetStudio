import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, forwardJson, ligFetch } from "../_lib/lig-client";

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const upstream = await ligFetch(
    "/api/v1/ar_objects",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    token,
  );

  const upstreamBody = await forwardJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(upstreamBody ?? { error: "Failed to create AR object" }, { status: upstream.status });
  }

  return NextResponse.json(upstreamBody ?? { ok: true }, { status: upstream.status });
}
