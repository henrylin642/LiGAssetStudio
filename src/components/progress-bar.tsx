"use client";

import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  value: number;
  message?: string;
}

export function ProgressBar({ value, message }: ProgressBarProps) {
  return (
    <div className="space-y-1">
      <Progress value={value} />
      {message ? <p className="text-xs text-slate-500">{message}</p> : null}
    </div>
  );
}
