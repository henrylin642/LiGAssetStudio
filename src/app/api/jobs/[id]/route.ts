import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken } from "../../_lib/lig-client";
import { getJob } from "../store";

type RouteContext =
  | { params: { id: string } }
  | { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const resolvedParams =
    context.params && typeof (context.params as Promise<{ id: string }>).then === "function"
      ? await (context.params as Promise<{ id: string }>)
      : (context.params as { id: string });

  const { id } = resolvedParams;
  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}
