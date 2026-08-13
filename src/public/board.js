'use strict';

let appConfig = null;
let stopId = null;
let multiStopMode = false;

const MEL_TZ = 'Australia/Melbourne';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const res = await fetch('/api/config');
    appConfig = await res.json();
  } catch {
    appConfig = { stops: [], refreshSeconds: 25, branding: {} };
  }

  const params = new URLSearchParams(location.search);
  const stopParam = params.get('stop');
  multiStopMode = !stopParam || stopParam === 'all';
  stopId = multiStopMode ? null : stopParam;

  // Branding
  const b = appConfig.branding ?? {};
  if (b.title) { document.getElementById('title').textContent = b.title; document.title = b.title; }
  if (b.logo) { const l = document.getElementById('logo'); l.src = b.logo; l.style.display = 'block'; }

  if (!multiStopMode && !stopId) { renderError('No stop configured.'); return; }

  await refresh();
  const ms = Math.max(10, appConfig.refreshSeconds ?? 25) * 1000;
  setInterval(refresh, ms);
}

// ── Refresh ───────────────────────────────────────────────────────────────────
async function refresh() {
  const url = multiStopMode ? '/api/departures' : `/api/departures?stop=${encodeURIComponent(stopId)}`;
  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch { return; }

  if (multiStopMode) renderMultiStop(data);
  else renderDepartures(data.departures ?? [], data.stale, data.lastUpdated);
}

// ── Multi-stop render ─────────────────────────────────────────────────────────
function renderMultiStop(data) {
  const rowsEl = document.getElementById('rows');
  const noDataEl = document.getElementById('no-data');
  updateFooter(data.lastUpdated, data.stale);

  const stops = data.stops ?? [];
  const allEmpty = stops.every((s) => (s.departures ?? []).length === 0);
  if (allEmpty) { rowsEl.innerHTML = ''; noDataEl.classList.add('visible'); return; }
  noDataEl.classList.remove('visible');

  const nowSec = Date.now() / 1000;
  rowsEl.innerHTML = stops.map((stopData) => {
    const id = stopData.stop?.id ?? '';
    const deps = stopData.departures ?? [];
    const label = escHtml(stopData.stop?.label ?? stopData.stop?.name ?? id);
    const flexGrow = deps.length || 1;

    const rows = deps.length > 0
      ? deps.map((dep) => depRowHtml(dep, nowSec)).join('')
      : emptyRowHtml();

    return `<div class="stop-section" style="flex:${flexGrow}"><div class="stop-section-header">${label}</div><div class="dep-rows">${rows}</div></div>`;
  }).join('');
}

// ── Single-stop render ────────────────────────────────────────────────────────
function renderDepartures(departures, stale, lastUpdated) {
  const rowsEl = document.getElementById('rows');
  const noDataEl = document.getElementById('no-data');
  updateFooter(lastUpdated, stale);

  if (departures.length === 0) { rowsEl.innerHTML = ''; noDataEl.classList.add('visible'); return; }
  noDataEl.classList.remove('visible');

  const nowSec = Date.now() / 1000;
  rowsEl.innerHTML = departures.map((d) => depRowHtml(d, nowSec)).join('');
}

// ── Row builders ──────────────────────────────────────────────────────────────
function depRowHtml(dep, nowSec) {
  const secsAway = dep.arrivalEpoch - nowSec;
  const minsAway = Math.round(secsAway / 60);
  const isDue = secsAway < 60;

  const minsLabel = isDue ? 'Now' : minsAway === 1 ? '1 min' : `${minsAway} min`;
  const dueClass = isDue ? ' due' : '';

  const depTime = new Date(dep.arrivalEpoch * 1000).toLocaleTimeString('en-AU', {
    timeZone: MEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return `<div class="dep-row">
  <div class="badge">${escHtml(dep.route)}</div>
  <div class="dest">${escHtml(dep.destination)}</div>
  <div class="time-group">
    <div class="mins${dueClass}">${minsLabel}</div>
    <div class="dep-time">${depTime}</div>
  </div>
</div>`;
}

function emptyRowHtml() {
  return `<div class="dep-row empty">
  <div class="badge">—</div>
  <div class="dest">No upcoming trams</div>
  <div class="time-group"><div class="mins">—</div></div>
</div>`;
}

// ── Footer / stale ────────────────────────────────────────────────────────────
function updateFooter(lastUpdated, stale) {
  const el = document.getElementById('updated-at');
  if (lastUpdated) {
    const hhmm = new Date(lastUpdated).toLocaleTimeString('en-AU', {
      timeZone: MEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    el.textContent = stale ? `⚠ Data delayed · last updated ${hhmm}` : `Updated ${hhmm}`;
    el.className = stale ? 'stale' : '';
  } else {
    el.textContent = 'Awaiting data…';
    el.className = '';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderError(msg) {
  document.getElementById('rows').innerHTML = '';
  const nd = document.getElementById('no-data');
  nd.querySelector('span').textContent = msg;
  nd.classList.add('visible');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('DOMContentLoaded', boot);
