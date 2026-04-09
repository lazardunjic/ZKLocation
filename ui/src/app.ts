import { getGpsPosition, coarsenPosition } from './gps.js';
import { getNearbyRegions, getCurrentSlot, postVerify } from './api.js';
import { prove } from './prover.js';
import type { RegionSummary } from './types.js';

// ── DOM refs ───────────────────────────────────────────────────────────────────

const cardLocation  = document.getElementById('card-location')!;
const cardRegions   = document.getElementById('card-regions')!;
const cardProve     = document.getElementById('card-prove')!;
const cardResult    = document.getElementById('card-result')!;

const btnGps        = document.getElementById('btn-gps') as HTMLButtonElement;
const btnManual     = document.getElementById('btn-manual') as HTMLButtonElement;
const inputLat      = document.getElementById('input-lat') as HTMLInputElement;
const inputLon      = document.getElementById('input-lon') as HTMLInputElement;
const statusGps     = document.getElementById('status-gps')!;

const statusRegions = document.getElementById('status-regions')!;
const regionList    = document.getElementById('region-list')!;

const selectedInfo  = document.getElementById('selected-region-info')!;
const btnProve      = document.getElementById('btn-prove') as HTMLButtonElement;
const statusProve   = document.getElementById('status-prove')!;
const progressWrap  = document.getElementById('progress-wrap')!;
const progressBar   = document.getElementById('progress-bar') as HTMLElement;

const jwtMeta       = document.getElementById('jwt-meta')!;
const jwtBox        = document.getElementById('jwt-box')!;
const btnCopy       = document.getElementById('btn-copy') as HTMLButtonElement;
const btnReset      = document.getElementById('btn-reset') as HTMLButtonElement;

// ── App state ──────────────────────────────────────────────────────────────────

let coarsePos: { latMicro: number; lonMicro: number; rawLat: number; rawLon: number } | null = null;
let selectedRegion: RegionSummary | null = null;

// ── Utilities ──────────────────────────────────────────────────────────────────

function show(el: HTMLElement) { el.classList.remove('hidden'); }
function hide(el: HTMLElement) { el.classList.add('hidden'); }
function undim(el: HTMLElement) { el.classList.remove('dimmed'); }

function setStatus(
  el: HTMLElement,
  msg: string,
  type: 'loading' | 'ok' | 'err' | 'warn' = 'loading',
) {
  show(el);
  const spinner = type === 'loading' ? '<span class="spinner"></span>' : '';
  const icon = type === 'ok' ? '✓' : type === 'err' ? '✕' : type === 'warn' ? '⚠' : '';
  el.className = `status-line ${type !== 'loading' ? type : ''}`;
  el.innerHTML = `${spinner}${icon ? `<span>${icon}</span>` : ''}${msg}`;
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m away` : `${(m / 1000).toFixed(1)} km away`;
}

// ── Step 1: GPS ────────────────────────────────────────────────────────────────

btnGps.addEventListener('click', async () => {
  btnGps.disabled = true;
  setStatus(statusGps, 'Requesting location…', 'loading');

  try {
    const pos = await getGpsPosition();
    coarsePos = coarsenPosition(pos);

    setStatus(statusGps, `Location acquired (±1 km grid)`, 'ok');
    btnGps.textContent = 'Re-acquire';
    btnGps.disabled = false;

    await loadRegions();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(statusGps, gpsErrorMessage(msg), 'err');
    btnGps.disabled = false;
  }
});

btnManual.addEventListener('click', async () => {
  const lat = parseFloat(inputLat.value);
  const lon = parseFloat(inputLon.value);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    setStatus(statusGps, 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).', 'err');
    show(statusGps);
    return;
  }
  coarsePos = {
    latMicro: Math.round((lat * 1_000_000 / 9009)) * 9009,
    lonMicro: Math.round((lon * 1_000_000 / 9009)) * 9009,
    rawLat: lat,
    rawLon: lon,
  };
  setStatus(statusGps, `Location set manually (${lat.toFixed(4)}, ${lon.toFixed(4)})`, 'ok');
  await loadRegions();
});

function gpsErrorMessage(code: string): string {
  if (code.includes('GPS_DENIED')) return 'Location access denied. Please allow location in browser settings.';
  if (code.includes('GPS_TIMEOUT')) return 'Location timed out. Try again outdoors.';
  if (code.includes('GPS_NOT_SUPPORTED')) return 'GPS not supported in this browser.';
  return `GPS error: ${code}`;
}

// ── Step 2: Regions ────────────────────────────────────────────────────────────

async function loadRegions() {
  if (!coarsePos) return;

  show(cardRegions);
  undim(cardRegions);
  setStatus(statusRegions, 'Searching nearby regions…', 'loading');
  regionList.innerHTML = '';

  try {
    const regions = await getNearbyRegions(coarsePos.latMicro, coarsePos.lonMicro);

    if (regions.length === 0) {
      setStatus(statusRegions, 'No regions found near your location.', 'warn');
      return;
    }

    hide(statusRegions);

    regions.forEach(r => {
      const item = document.createElement('div');
      item.className = 'region-item';
      item.innerHTML = `
        <div>
          <div class="region-name">${escapeHtml(r.name)}</div>
          <div class="region-dist">${formatDistance(r.distance_m)}</div>
        </div>
        <div class="region-radius">r = ${r.radius_m} m</div>
      `;
      item.addEventListener('click', () => selectRegion(r, item));
      regionList.appendChild(item);
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(statusRegions, `Failed to load regions: ${msg}`, 'err');
  }
}

function selectRegion(r: RegionSummary, el: HTMLElement) {
  selectedRegion = r;

  document.querySelectorAll('.region-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');

  show(cardProve);
  undim(cardProve);
  selectedInfo.textContent = `Region: ${r.name}  ·  radius ${r.radius_m} m`;
  btnProve.disabled = false;
}

// ── Step 3: Prove ──────────────────────────────────────────────────────────────

btnProve.addEventListener('click', async () => {
  if (!coarsePos || !selectedRegion) return;

  btnProve.disabled = true;
  show(progressWrap);
  setProgress(0);

  let slotStr: string;
  try {
    setStatus(statusProve, 'Fetching current slot…', 'loading');
    const slotResp = await getCurrentSlot();
    slotStr = slotResp.slot;
    setStatus(statusProve, `Slot: ${slotStr}`, 'ok');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(statusProve, `Slot fetch failed: ${msg}`, 'err');
    btnProve.disabled = false;
    return;
  }

  try {
    const proofResult = await prove(
      {
        latMicro: Math.round(coarsePos.rawLat * 1_000_000),
        lonMicro: Math.round(coarsePos.rawLon * 1_000_000),
        region: selectedRegion,
        slot: slotStr,
      },
      (msg, pct) => {
        setStatus(statusProve, msg, 'loading');
        setProgress(pct);
      },
    );

    setStatus(statusProve, 'Submitting proof to backend…', 'loading');
    setProgress(95);

    const verifyResp = await postVerify({
      proof: proofResult.proofHex,
      public_inputs: {
        nullifier_hash: proofResult.nullifierHashHex,
        region_id: selectedRegion.region_id,
        centroid_lat: selectedRegion.centroid_lat,
        centroid_lon: selectedRegion.centroid_lon,
        radius_m: selectedRegion.radius_m,
        slot_field: proofResult.slotField,
      },
    });

    setProgress(100);
    setStatus(statusProve, 'Proof accepted!', 'ok');

    showResult(verifyResp.jwt, verifyResp.expires_at, selectedRegion.name);
  } catch (err: unknown) {
    console.error('[prove] full error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(statusProve, `Proof failed: ${msg}`, 'err');
    btnProve.disabled = false;
    hide(progressWrap);
  }
});

function setProgress(pct: number) {
  progressBar.style.width = `${pct}%`;
}

// ── Step 4: Result ─────────────────────────────────────────────────────────────

function showResult(jwt: string, expiresAt: number, regionName: string) {
  show(cardResult);

  const exp = new Date(expiresAt * 1000).toLocaleTimeString();
  jwtMeta.textContent = `Region: ${regionName}  ·  Expires at ${exp}`;
  jwtBox.textContent = jwt;
}

btnCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(jwtBox.textContent ?? '').then(() => {
    btnCopy.textContent = 'Copied!';
    setTimeout(() => { btnCopy.textContent = 'Copy JWT'; }, 2000);
  });
});

btnReset.addEventListener('click', () => {
  // Reset to step 1 (keep location, re-select region)
  hide(cardResult);
  hide(progressWrap);
  selectedRegion = null;

  document.querySelectorAll('.region-item').forEach(i => i.classList.remove('selected'));

  hide(cardProve);
  cardProve.classList.add('dimmed');
  btnProve.disabled = true;
  hide(statusProve);
  setProgress(0);
  selectedInfo.textContent = '';
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Preserve card-prove hidden state on init
cardRegions.classList.add('hidden');
cardProve.classList.add('hidden');
cardResult.classList.add('hidden');
void cardLocation;
