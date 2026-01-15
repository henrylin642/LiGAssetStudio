import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, forwardJson, ligFetch } from "../../_lib/lig-client";

function ensureToken(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error("Unauthorized");
  }
  return token;
}


export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const token = ensureToken(request);
    const { id } = await context.params;
    const upstream = await ligFetch(`/api/v1/ar_objects/${id}`, { method: "GET" }, token);
    const upstreamBody = await forwardJson(upstream);
    if (!upstream.ok) {
      return NextResponse.json(upstreamBody ?? { error: "Failed to load AR object" }, { status: upstream.status });
    }
    return NextResponse.json(upstreamBody ?? { error: "Empty response" }, { status: upstream.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Failed to fetch AR object", error);
    return NextResponse.json({ error: "Failed to fetch AR object" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  const { id } = await context.params;
  const upstream = await ligFetch(
    `/api/v1/ar_objects/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    token,
  );

  const upstreamBody = await forwardJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(upstreamBody ?? { error: "Failed to update AR object" }, { status: upstream.status });
  }

  return NextResponse.json(upstreamBody ?? { ok: true }, { status: upstream.status });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

  const { id } = await context.params;
  const upstream = await ligFetch(
    `/api/v1/ar_objects/${id}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    token,
  );

  const upstreamBody = await forwardJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(upstreamBody ?? { error: "Failed to update AR object" }, { status: upstream.status });
  }

  return NextResponse.json(upstreamBody ?? { ok: true }, { status: upstream.status });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const upstream = await ligFetch(
    `/api/v1/ar_objects/${id}`,
    {
      method: "DELETE",
    },
    token,
  );

  if (!upstream.ok) {
    const upstreamBody = await forwardJson(upstream);
    return NextResponse.json(upstreamBody ?? { error: "Failed to delete AR object" }, { status: upstream.status });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
