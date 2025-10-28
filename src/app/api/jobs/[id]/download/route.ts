import { NextRequest, NextResponse } from "next/server";

const MOCK_ZIP_PATH = "/mock/jobs/job-sample.zip";

export async function GET(request: NextRequest) {
  const location = new URL(MOCK_ZIP_PATH, request.nextUrl.origin);
  return NextResponse.redirect(location.toString(), 302);
}

