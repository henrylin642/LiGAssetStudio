import { randomUUID } from "crypto";
import type { CreateJobInput, JobState, JobStatus, ResultAsset } from "@/types/dto";

type JobRecord = JobStatus;

type JobStore = {
  jobs: Map<string, JobRecord>;
};

const storeKey = "__ASSETS_STUDIO_JOB_STORE__";

function getStore(): JobStore {
  const globalAny = globalThis as unknown as Record<string, JobStore | undefined>;
  if (!globalAny[storeKey]) {
    globalAny[storeKey] = { jobs: new Map<string, JobRecord>() };
  }
  return globalAny[storeKey]!;
}

function nowIso() {
  return new Date().toISOString();
}

function createResultZip(jobId: string): ResultAsset {
  return {
    id: `${jobId}-zip`,
    jobId,
    kind: "zip",
    filename: `${jobId}.zip`,
    size: 1024 * 1024,
    url: `/api/jobs/${jobId}/download`,
  };
}

function nextState(current: JobState): JobState {
  switch (current) {
    case "queued":
      return "validating";
    case "validating":
      return "processing";
    case "processing":
      return "done";
    default:
      return current;
  }
}

function scheduleJob(job: JobRecord) {
  const store = getStore();
  const update = () => {
    const current = store.jobs.get(job.id);
    if (!current) return;
    if (current.state === "done" || current.state === "error" || current.state === "canceled") {
      return;
    }
    const next = nextState(current.state);
    const progress =
      next === "validating" ? 25 : next === "processing" ? Math.min(75, current.progress + 25) : 100;
    const updated: JobRecord = {
      ...current,
      state: next,
      progress,
      updatedAt: nowIso(),
    };
    if (next === "done") {
      updated.results = [createResultZip(job.id)];
      updated.message = "Job completed successfully";
    } else {
      updated.message = `Job ${next}`;
    }
    store.jobs.set(job.id, updated);
    if (next !== "done") {
      setTimeout(update, 1500);
    }
  };
  setTimeout(update, 1000);
}

export function listJobs(): JobRecord[] {
  return Array.from(getStore().jobs.values()).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function getJob(jobId: string) {
  return getStore().jobs.get(jobId);
}

export function createJob(payload: CreateJobInput): JobRecord {
  const store = getStore();
  const id = randomUUID();
  const timestamp = nowIso();
  const job: JobRecord = {
    id,
    state: "queued",
    progress: 0,
    message: "Job queued",
    results: [],
    kind: payload.kind,
    createdAt: timestamp,
    updatedAt: timestamp,
    options: payload.options,
    assetIds: payload.assetIds,
  };
  store.jobs.set(id, job);
  scheduleJob(job);
  return job;
}

