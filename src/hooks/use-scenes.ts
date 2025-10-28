"use client";

import { useQuery } from "@tanstack/react-query";
import type { Scene } from "@/types/dto";
import { useApi } from "./use-api";

export function useScenesQuery() {
  const api = useApi();

  return useQuery<Scene[], Error>({
    queryKey: ["scenes"],
    queryFn: async () => {
      const response = await api("/scenes");
      if (!response.ok) {
        throw new Error(`Failed to fetch scenes (${response.status})`);
      }
      return (await response.json()) as Scene[];
    },
  });
}
