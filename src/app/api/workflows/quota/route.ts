import { NextRequest, NextResponse } from "next/server";
import { getQuota } from "@/lib/quota-store";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  }
  const quota = getQuota(userId);
  return NextResponse.json({ quota });
}
