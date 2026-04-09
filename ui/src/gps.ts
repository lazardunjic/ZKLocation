// GPS coarsening: round to ~1 km grid in micro-degrees.
// 1 degree latitude = ~111,000 m → 1 km ≈ 9009 micro-degrees.
const GRID_MICRODEG = 9009;

export interface CoarsePosition {
  latMicro: number;   // coarsened latitude in micro-degrees
  lonMicro: number;   // coarsened longitude in micro-degrees
  rawLat: number;     // original degrees (for circuit witness)
  rawLon: number;
}

export function getGpsPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS_NOT_SUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === 1) reject(new Error('GPS_DENIED'));
      else if (err.code === 3) reject(new Error('GPS_TIMEOUT'));
      else reject(new Error('GPS_ERROR'));
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 });
  });
}

export function coarsenPosition(pos: GeolocationPosition): CoarsePosition {
  const rawLat = pos.coords.latitude;
  const rawLon = pos.coords.longitude;

  const latMicro = Math.round((rawLat * 1_000_000) / GRID_MICRODEG) * GRID_MICRODEG;
  const lonMicro = Math.round((rawLon * 1_000_000) / GRID_MICRODEG) * GRID_MICRODEG;

  return { latMicro, lonMicro, rawLat, rawLon };
}

/** Convert decimal degrees to micro-degrees integer. */
export function toMicro(deg: number): number {
  return Math.round(deg * 1_000_000);
}
