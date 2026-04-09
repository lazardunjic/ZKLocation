import type { RegionSummary, SlotResponse, VerifyRequest, VerifyResponse, ErrorResponse } from './types.js';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) {
    const err = body as ErrorResponse;
    throw new Error(`${err.error}: ${err.message}`);
  }
  return body as T;
}

export function getNearbyRegions(latMicro: number, lonMicro: number): Promise<RegionSummary[]> {
  return apiFetch<RegionSummary[]>(`/regions/nearby?lat=${latMicro}&lon=${lonMicro}`);
}

export function getCurrentSlot(): Promise<SlotResponse> {
  return apiFetch<SlotResponse>('/slot');
}

export function postVerify(req: VerifyRequest): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>('/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}
