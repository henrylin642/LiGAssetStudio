import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken } from "../../_lib/lig-client";
import { getJob } from "../store";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const job = getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

