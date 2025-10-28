"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateJobInput, JobStatus } from "@/types/dto";
import { useApi } from "./use-api";

export function useJobsQuery() {
  const api = useApi();

  return useQuery<JobStatus[], Error>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const response = await api("/jobs");
      if (!response.ok) {
        throw new Error(`Failed to fetch jobs (${response.status})`);
      }
      return (await response.json()) as JobStatus[];
    },
    refetchInterval: 5000,
  });
}

export function useJobQuery(id: string) {
  const api = useApi();

  return useQuery<JobStatus, Error>({
    queryKey: ["job", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const response = await api(`/jobs/${id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch job (${response.status})`);
      }
      return (await response.json()) as JobStatus;
    },
    refetchInterval: 3000,
  });
}

export function useCreateJobMutation() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateJobInput) => {
      const response = await api("/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Failed to create job (${response.status})`);
      }
      return (await response.json()) as JobStatus;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
