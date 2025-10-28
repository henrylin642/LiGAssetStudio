import { NextRequest, NextResponse } from "next/server";
import type { Asset, AssetPage, AssetType } from "@/types/dto";
import { extractBearerToken, forwardJson, ligFetch } from "../_lib/lig-client";
import { normalizeAsset, type UpstreamAsset } from "./helpers";

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search");
  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "24");
  const typeFilter = searchParams.get("type") as AssetType | "all" | null;

  if (typeFilter && typeFilter !== "all") {
    return handleFilteredAssets({
      token,
      search,
      page,
      perPage,
      type: typeFilter,
    });
  }

  return handleStandardAssets({
    token,
    search,
    page,
    perPage,
  });
}

async function handleStandardAssets({
  token,
  search,
  page,
  perPage,
}: {
  token: string;
  search: string | null;
  page: number;
  perPage: number;
}) {
  const ligParams = new URLSearchParams();
  if (search) ligParams.set("search", search);
  ligParams.set("page", page.toString());
  ligParams.set("per_page", perPage.toString());

  const upstream = await ligFetch(`/api/v1/assets?${ligParams.toString()}`, { method: "GET" }, token);

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (upstream.status >= 500) {
    return NextResponse.json(
      { error: "Upstream unavailable", status: upstream.status },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const body = await forwardJson(upstream);
    return NextResponse.json(body ?? { error: "Failed to fetch assets" }, { status: upstream.status });
  }

  const headerTotals = extractHeaderTotals(upstream.headers);
  const payload = await forwardJson(upstream);
  const itemsSource: UpstreamAsset[] = extractAssets(payload);

  const mapped = itemsSource
    .map((item) => normalizeAsset(item))
    .filter((item): item is Asset => item !== null);

  const inferredMaxId = Math.max(
    0,
    ...mapped
      .map((asset) => Number.parseInt(asset.id, 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  const total = resolveTotal(payload, mapped.length, perPage, headerTotals, inferredMaxId);

  const assetPage: AssetPage = {
    items: mapped,
    page,
    pageSize: perPage,
    total,
  };

  return NextResponse.json(assetPage);
}

async function handleFilteredAssets({
  token,
  search,
  page,
  perPage,
  type,
}: {
  token: string;
  search: string | null;
  page: number;
  perPage: number;
  type: AssetType;
}) {
  const upstreamPageSize = Math.max(perPage * 3, 60);
  const baseParams = new URLSearchParams();
  if (search) baseParams.set("search", search);
  baseParams.set("type", type);
  baseParams.set("per_page", upstreamPageSize.toString());

  const aggregated: Asset[] = [];
  const startIndex = Math.max(0, (page - 1) * perPage);
  const desiredCount = startIndex + perPage + perPage; // preload one extra page to infer pagination
  let upstreamPage = 1;
  let upstreamEnded = false;
  const MAX_UPSTREAM_PAGES = 40;
  let loops = 0;

  while (!upstreamEnded && loops < MAX_UPSTREAM_PAGES && aggregated.length < desiredCount) {
    const params = new URLSearchParams(baseParams);
    params.set("page", upstreamPage.toString());
    const upstream = await ligFetch(`/api/v1/assets?${params.toString()}`, { method: "GET" }, token);

    if (upstream.status === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (upstream.status >= 500) {
      return NextResponse.json(
        { error: "Upstream unavailable", status: upstream.status },
        { status: 502 },
      );
    }

    const payload = await forwardJson(upstream);

    if (!upstream.ok) {
      return NextResponse.json(payload ?? { error: "Failed to fetch assets" }, { status: upstream.status });
    }

    const itemsSource: UpstreamAsset[] = extractAssets(payload);
    const mapped = itemsSource
      .map((item) => normalizeAsset(item))
      .filter((item): item is Asset => item !== null);

    aggregated.push(...mapped.filter((asset) => asset.type === type));

    if (itemsSource.length < upstreamPageSize) {
      upstreamEnded = true;
    } else {
      upstreamPage += 1;
    }

    loops += 1;
  }

  const totalFiltered = aggregated.length;
  const items = aggregated.slice(startIndex, startIndex + perPage);
  const reachedLimit = !upstreamEnded && loops >= MAX_UPSTREAM_PAGES;
  const total = upstreamEnded
    ? totalFiltered
    : Math.max(totalFiltered, startIndex + items.length + (items.length === perPage || reachedLimit ? perPage : 0));

  const assetPage: AssetPage = {
    items,
    page,
    pageSize: perPage,
    total,
  };

  return NextResponse.json(assetPage);
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { assets?: unknown }).assets)) {
    return NextResponse.json({ error: "Invalid assets payload" }, { status: 400 });
  }

  const upstream = await ligFetch(
    "/api/v1/assets",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );

  if (upstream.status === 401) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (upstream.status >= 500) {
    return NextResponse.json(
      { error: "Upstream unavailable", status: upstream.status },
      { status: 502 },
    );
  }

  const body = await forwardJson(upstream);

  if (!upstream.ok) {
    return NextResponse.json(body ?? { error: "Failed to create assets" }, { status: upstream.status });
  }

  return NextResponse.json(body ?? { ok: true }, { status: upstream.status });
}

function extractAssets(payload: unknown): UpstreamAsset[] {
  if (Array.isArray(payload)) {
    return payload as UpstreamAsset[];
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const candidateSources: unknown[] = [];
  const root = payload as Record<string, unknown>;
  candidateSources.push(root.items, root.assets, root.data);

  if (root.data && typeof root.data === "object") {
    const data = root.data as Record<string, unknown>;
    candidateSources.push(data.items, data.assets, data.list, data.results);

    if (data.assets && Array.isArray(data.assets)) {
      return data.assets as UpstreamAsset[];
    }
  }

  for (const candidate of candidateSources) {
    if (Array.isArray(candidate)) {
      return candidate as UpstreamAsset[];
    }
  }

  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      return value as UpstreamAsset[];
    }
  }

  return [];
}

function resolveTotal(
  payload: unknown,
  fallback: number,
  perPage: number,
  headerTotals: { total?: number; totalPages?: number },
  inferredMaxId: number,
): number {
  if (headerTotals.totalPages && headerTotals.totalPages > 0) {
    return headerTotals.totalPages * perPage;
  }
  if (headerTotals.total && headerTotals.total > 0) {
    return headerTotals.total;
  }
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const root = payload as Record<string, unknown>;
  const metaCandidates = [
    root.meta,
    root.pagination,
    root.page,
    (root.data as Record<string, unknown>)?.meta,
    (root.data as Record<string, unknown>)?.pagination,
  ];

  for (const meta of metaCandidates) {
    if (!meta || typeof meta !== "object") continue;
    const metaObj = meta as Record<string, unknown>;
    const total = pickNumber(metaObj, [
      "total",
      "totalCount",
      "total_count",
      "totalEntries",
      "total_entries",
      "count",
      "totalRecords",
      "total_records",
    ]);
    if (total !== undefined) return total;

    const totalPages = pickNumber(metaObj, ["totalPages", "total_pages"]);
    const perPageMeta = pickNumber(metaObj, ["perPage", "per_page", "limit", "pageSize", "page_size"]);
    if (totalPages !== undefined) {
      return totalPages * (perPageMeta ?? perPage);
    }
  }

  const totalValue = pickNumber(root, ["total", "totalCount", "total_count", "totalRecords", "total_records"]);
  if (totalValue !== undefined) return totalValue;
  if (inferredMaxId > 0) return inferredMaxId;

  return fallback;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function extractHeaderTotals(headers: Headers): { total?: number; totalPages?: number } {
  const entries = Array.from(headers.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.toLowerCase()] = value;
    return acc;
  }, {});

  const headerTotal = pickNumber(entries, [
    "x-total",
    "x-total-count",
    "x-total-records",
    "x-totalentries",
    "x-total_entries",
  ]);
  const headerPages = pickNumber(entries, ["x-total-pages", "x-totalpages"]);

  return {
    total: headerTotal,
    totalPages: headerPages,
  };
}
