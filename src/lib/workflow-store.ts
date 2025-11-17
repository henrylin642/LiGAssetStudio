import { randomUUID } from "crypto";

export type WorkflowStatus = "pending" | "running" | "succeeded" | "failed";

export type WorkflowJob = {
  id: string;
  userId?: string | null;
  params: Record<string, unknown>;
  credits: number;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  logs: Array<{ timestamp: string; message: string }>;
};

const jobs = new Map<string, WorkflowJob>();

export function createWorkflowJob(input: { userId?: string | null; params: Record<string, unknown>; credits?: number }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const job: WorkflowJob = {
    id,
    userId: input.userId ?? null,
    params: input.params,
    credits: input.credits ?? 1,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    logs: [{ timestamp: now, message: "Job queued" }],
  };
  jobs.set(id, job);

  setTimeout(() => startJob(id), 200);

  return job;
}

function startJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  job.logs.push({ timestamp: job.updatedAt, message: "Workflow started" });
  setTimeout(() => finishJob(id), 1500);
}

function finishJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "succeeded";
  job.updatedAt = new Date().toISOString();
  job.logs.push({ timestamp: job.updatedAt, message: "Workflow completed (stub)" });
}

export function getWorkflowJob(id: string) {
  return jobs.get(id) ?? null;
}
