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

    const rows = deps.length > 0
      ? deps.map((dep) => depRowHtml(dep, nowSec)).join('')
      : emptyRowHtml();

    return `<div class="stop-section"><div class="stop-section-header">${label}</div><div class="dep-rows">${rows}</div></div>`;
  }).join('');

  setEqualRowHeight();
  enableAutoScroll();
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

  setEqualRowHeight();
  enableAutoScroll();
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

function setEqualRowHeight() {
  const rowsEl = document.getElementById('rows');
  const sections = [...rowsEl.querySelectorAll('.stop-section')];
  const allRows = [...rowsEl.querySelectorAll('.dep-row')];

  if (!sections.length || !allRows.length) return;

  const headerHeight = sections.reduce((total, section) => {
    return total + section.querySelector('.stop-section-header').offsetHeight;
  }, 0);

  const rowHeight = Math.max(
    70,
    Math.min(
      150,
      (rowsEl.clientHeight - headerHeight - 4) / allRows.length
    )
  );

  allRows.forEach((row) => {
    row.style.flex = `0 0 ${rowHeight}px`;
    row.style.height = `${rowHeight}px`;
  });
}

// ── Auto-scroll departures list ───────────────────────────────────────────────
let scrollInterval = null;

function enableAutoScroll() {
  const rowsEl = document.getElementById('rows');

  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }

  requestAnimationFrame(() => {
    const isOverflowing = rowsEl.scrollHeight > rowsEl.clientHeight;

    if (isOverflowing) {
      rowsEl.classList.add('auto-scroll');

      const scrollSpeed = 50;
      const pauseAtTop = 3000;
      const pauseAtBottom = 2000;

      let isAtTop = true;
      let isPaused = true;

      setTimeout(() => {
        isPaused = false;
        startScrolling();
      }, pauseAtTop);

      function startScrolling() {
        scrollInterval = setInterval(() => {
          if (isPaused) return;

          const maxScroll = rowsEl.scrollHeight - rowsEl.clientHeight;

          if (isAtTop) {
            rowsEl.scrollTop += 1;

            if (rowsEl.scrollTop >= maxScroll) {
              rowsEl.scrollTop = maxScroll;
              isPaused = true;

              setTimeout(() => {
                isAtTop = false;
                isPaused = false;
              }, pauseAtBottom);
            }
          } else {
            rowsEl.scrollTop -= 1;

            if (rowsEl.scrollTop <= 0) {
              rowsEl.scrollTop = 0;
              isPaused = true;

              setTimeout(() => {
                isAtTop = true;
                isPaused = false;
              }, pauseAtTop);
            }
          }
        }, 1000 / scrollSpeed);
      }
    } else {
      rowsEl.classList.remove('auto-scroll');
      rowsEl.scrollTop = 0;
    }
  });
}

// ── Scrolling text for overflow ───────────────────────────────────────────────
function enableScrollingText() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.stop-section-header').forEach((el) => {
      if (el.classList.contains('scroll')) {
        const span = el.querySelector('span');
        const text = span ? span.getAttribute('data-text') || span.textContent : el.textContent;
        el.textContent = text;
        el.classList.remove('scroll');
      }

      if (isTextOverflowing(el)) {
        const text = el.textContent;
        el.innerHTML = `<span data-text="${escHtml(text)}">${escHtml(text)}</span>`;
        el.classList.add('scroll');
      }
    });

    document.querySelectorAll('.dest').forEach((el) => {
      if (el.classList.contains('scroll')) {
        const span = el.querySelector('span');
        const text = span ? span.getAttribute('data-text') || span.textContent : el.textContent;
        el.textContent = text;
        el.classList.remove('scroll');
      }

      if (isTextOverflowing(el)) {
        const text = el.textContent;
        el.innerHTML = `<span data-text="${escHtml(text)}">${escHtml(text)}</span>`;
        el.classList.add('scroll');
      }
    });
  });
}

function isTextOverflowing(element) {
  return element.scrollWidth > element.clientWidth;
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

// ── Window resize handler ─────────────────────────────────────────────────────
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    setEqualRowHeight();
    enableAutoScroll();
  }, 250);
});

window.addEventListener('DOMContentLoaded', boot);
