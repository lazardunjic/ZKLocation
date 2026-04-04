import type { RegionSummary } from "../types/index.js";
import { getAllRegionAccounts } from "./solana.js";

const REFRESH_INTERVAL_MS = 60_000;

// Absorbs worst-case 1km grid rounding error + GPS accuracy (~±500m).
const NEARBY_BUFFER_M = 1_500;

const NEARBY_CAP = 10_000;

interface CachedRegion {
  region_id: string;     // hex
  name: string;
  centroid_lat: number;  // micro-degrees
  centroid_lon: number;
  radius_m: number;
  authority: string;
}

let _cache: CachedRegion[] = [];
let _lastRefresh = 0;
let _refreshTimer: NodeJS.Timeout | null = null;

function distanceMetres(
  lat1_ud: number,
  lon1_ud: number,
  lat2_ud: number,
  lon2_ud: number,
): number {
  const lat1 = lat1_ud / 1_000_000;
  const lon1 = lon1_ud / 1_000_000;
  const lat2 = lat2_ud / 1_000_000;
  const lon2 = lon2_ud / 1_000_000;

  const R = 6_371_000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchAllRegions(): Promise<CachedRegion[]> {
  const accounts = await getAllRegionAccounts();
  return accounts.map(({ account }: { account: Record<string, unknown> }) => ({
    region_id: Buffer.from(account.regionId as Uint8Array).toString("hex"),
    name: account.name as string,
    centroid_lat: Number(account.centroidLat),
    centroid_lon: Number(account.centroidLon),
    radius_m: account.radiusM as number,
    authority: (account.authority as { toBase58(): string }).toBase58(),
  }));
}

export async function refreshCache(): Promise<void> {
  try {
    _cache = await fetchAllRegions();
    _lastRefresh = Date.now();
    console.log(`[regionCache] Refreshed — ${_cache.length} regions loaded.`);
  } catch (err) {
    console.error("[regionCache] Refresh failed:", err);
  }
}

export function startCacheRefresh(): void {
  void refreshCache();
  _refreshTimer = setInterval(() => void refreshCache(), REFRESH_INTERVAL_MS);
}

export function stopCacheRefresh(): void {
  if (_refreshTimer) clearInterval(_refreshTimer);
}

export function getNearbyRegions(
  coarse_lat_ud: number,
  coarse_lon_ud: number,
): RegionSummary[] {
  const results: RegionSummary[] = [];

  for (const region of _cache) {
    const dist = distanceMetres(
      coarse_lat_ud,
      coarse_lon_ud,
      region.centroid_lat,
      region.centroid_lon,
    );
    if (dist < region.radius_m + NEARBY_BUFFER_M) {
      results.push({
        region_id: region.region_id,
        name: region.name,
        centroid_lat: region.centroid_lat,
        centroid_lon: region.centroid_lon,
        radius_m: region.radius_m,
        distance_m: Math.round(dist),
      });
    }
  }

  results.sort((a, b) => a.distance_m - b.distance_m);
  return results.slice(0, NEARBY_CAP);
}

export function getRegionById(region_id_hex: string): CachedRegion | undefined {
  return _cache.find((r) => r.region_id === region_id_hex.toLowerCase());
}

export function getCacheAge(): number {
  return _lastRefresh ? Date.now() - _lastRefresh : Infinity;
}
