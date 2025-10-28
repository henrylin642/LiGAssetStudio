import { NextRequest, NextResponse } from "next/server";
import type { CreateJobInput } from "@/types/dto";
import { extractBearerToken } from "../_lib/lig-client";
import { createJob, listJobs } from "./store";

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  return NextResponse.json(listJobs());
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as CreateJobInput;
    if (!payload?.assetIds?.length) {
      return NextResponse.json({ error: "assetIds must not be empty" }, { status: 400 });
    }
    if (!payload.kind || !payload.options) {
      return NextResponse.json({ error: "kind and options are required" }, { status: 400 });
    }
    const job = createJob(payload);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("Failed to create job", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

