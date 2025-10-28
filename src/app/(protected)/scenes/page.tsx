"use client";

import { Button } from "@/components/ui/button";
import { useScenesQuery } from "@/hooks/use-scenes";

export default function ScenesPage() {
  const scenesQuery = useScenesQuery();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scenes</h1>
          <p className="text-sm text-slate-500">Reference list for uploading AR objects.</p>
        </div>
        <Button variant="outline" onClick={() => scenesQuery.refetch()} disabled={scenesQuery.isRefetching}>
          {scenesQuery.isRefetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {scenesQuery.isError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {scenesQuery.error?.message ?? "Unable to load scenes"}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {(scenesQuery.data ?? []).map((scene) => (
              <tr key={scene.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{scene.id}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{scene.name}</td>
                <td className="px-4 py-3 text-slate-600">{scene.description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(scenesQuery.data?.length ?? 0) === 0 && !scenesQuery.isLoading ? (
        <p className="text-sm text-slate-500">No scenes available yet.</p>
      ) : null}
    </div>
  );
}
