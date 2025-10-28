"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/progress-bar";
import { ResultList } from "@/components/result-list";
import { useJobsQuery } from "@/hooks/use-jobs";
import { formatDateTime } from "@/lib/utils";

export default function JobsPage() {
  const jobsQuery = useJobsQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500">Monitor adapter job progress and download results.</p>
        </div>
        <Button variant="outline" onClick={() => jobsQuery.refetch()} disabled={jobsQuery.isRefetching}>
          {jobsQuery.isRefetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {jobsQuery.isError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {jobsQuery.error?.message ?? "Unable to load jobs"}
        </p>
      ) : null}

      <div className="space-y-4">
        {(jobsQuery.data ?? []).map((job) => (
          <div key={job.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">Job {job.id.slice(0, 8)}</h2>
              <Badge variant="secondary">{job.kind.toUpperCase()}</Badge>
              <Badge variant="outline">{job.state.toUpperCase()}</Badge>
              <span className="text-xs text-slate-500">Updated {formatDateTime(job.updatedAt)}</span>
            </div>
            <ProgressBar value={job.progress} message={job.message} />
            <div className="text-xs text-slate-500">
              Assets: {job.assetIds.join(", ") || "—"}
            </div>
            <ResultList assets={job.results ?? []} />
          </div>
        ))}
      </div>

      {(jobsQuery.data?.length ?? 0) === 0 && !jobsQuery.isLoading ? (
        <p className="text-sm text-slate-500">No jobs yet. Create one from the gallery or asset detail page.</p>
      ) : null}
    </div>
  );
}
