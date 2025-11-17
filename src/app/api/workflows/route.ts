import { NextRequest, NextResponse } from "next/server";
import { createWorkflowJob, getWorkflowJob } from "@/lib/workflow-store";
import { tryConsumeQuota, getQuota } from "@/lib/quota-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { userId?: string; params?: Record<string, unknown>; credits?: number };
    if (!body?.params) {
      return NextResponse.json({ error: "缺少 params" }, { status: 400 });
    }
    if (!body.userId) {
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    }
    const credits = Number.isFinite(body.credits) && (body.credits ?? 1) > 0 ? Number(body.credits) : 1;
    const consume = tryConsumeQuota(body.userId, credits);
    if (!consume.ok) {
      const quota = getQuota(body.userId);
      const remainingDaily = Math.max(0, quota.dailyLimit - quota.dailyUsed);
      const remainingMonthly = Math.max(0, quota.monthlyLimit - quota.monthlyUsed);
      return NextResponse.json(
        {
          error:
            consume.reason === "daily"
              ? `超過每日上限，剩餘 ${remainingDaily} 張`
              : `超過本月上限，剩餘 ${remainingMonthly} 張`,
        },
        { status: 402 },
      );
    }
    const job = createWorkflowJob({ userId: body.userId, params: body.params, credits });
    return NextResponse.json({ job });
  } catch (error) {
    console.error("Create workflow job failed", error);
    return NextResponse.json({ error: "無法建立工作" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  const job = getWorkflowJob(id);
  if (!job) {
    return NextResponse.json({ error: "找不到指定工作" }, { status: 404 });
  }
  return NextResponse.json({ job });
}
