"use client";

import { useQuery } from "@tanstack/react-query";
import type { AssetPage, AssetType } from "@/types/dto";
import { useApi } from "./use-api";

interface UseAssetsParams {
  search?: string;
  page: number;
  perPage: number;
  type: AssetType | "all";
}

export function useAssetsQuery(params: UseAssetsParams) {
  const api = useApi();

  return useQuery<AssetPage, Error>({
    queryKey: ["assets", params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.search) query.set("search", params.search);
      query.set("page", String(params.page));
      query.set("per_page", String(params.perPage));
      if (params.type !== "all") query.set("type", params.type);
      const response = await api(`/assets?${query.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets (${response.status})`);
      }
      return (await response.json()) as AssetPage;
    },
    placeholderData: (previousData) => previousData,
  });
}
