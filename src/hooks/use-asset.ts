"use client";

import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@/types/dto";
import { useApi } from "./use-api";

export function useAssetQuery(assetId: string) {
  const api = useApi();

  return useQuery<Asset, Error>({
    queryKey: ["asset", assetId],
    enabled: Boolean(assetId),
    queryFn: async () => {
      const response = await api(`/assets/${assetId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch asset (${response.status})`);
      }
      return (await response.json()) as Asset;
    },
  });
}
