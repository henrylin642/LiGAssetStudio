"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { ResultAsset } from "@/types/dto";
import { formatBytes } from "@/lib/utils";

interface ResultListProps {
  assets: ResultAsset[];
}

export function ResultList({ assets }: ResultListProps) {
  if (!assets?.length) {
    return <p className="text-sm text-slate-500">No outputs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {assets.map((asset) => (
        <div key={asset.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-slate-900">{asset.filename}</p>
            <p className="text-xs text-slate-500">
              {asset.kind.toUpperCase()} • {formatBytes(asset.size)}
            </p>
          </div>
          <Link
            href={asset.url}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <Download className="h-4 w-4" />
            Download
          </Link>
        </div>
      ))}
    </div>
  );
}
