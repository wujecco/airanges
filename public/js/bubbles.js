/* airanges — bubbles.js (robust fields, 10 bubbles, no accumulation) */

const RANGES = ['hour', 'day', 'week', 'month', 'year'];
const API_BASE = '/api/sp500';
const LIMIT = 10;

/* ---------- DOM helpers ---------- */
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function ensureSVG() {
  let svg = qs('svg#bubbles') || qs('#bubbles svg') || qs('svg');
  const container = qs('#bubbles') || document.body;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'bubbles');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '520');
    svg.style.display = 'block';
    svg.style.maxWidth = '1400px';
    svg.style.margin = '0 auto';
    container.appendChild(svg);
  }
  return svg;
}

function clearBubbles() {
  const svg = ensureSVG();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const container = qs('#bubbles');
  if (container && container !== svg) {
    qsa(':scope > :not(svg)', container).forEach(n => n.remove());
  }
}

/* ---------- Data fetch & normalization ---------- */
function toNum(x) {
  const n = typeof x === 'string' ? parseFloat(x) : x;
  return Number.isFinite(n) ? n : null;
}

function pickChangePercent(d) {
  // akceptuj różne nazwy pól z backendu
  const raw =
    d.changePercent ??
    d.change_percent ??
    d.changePct ??
    d.pct ??
    d.percent ??
    d.change; // last resort
  return toNum(raw);
}

function pickPrice(d) {
  const raw = d.price ?? d.close ?? d.last ?? d.latest;
  return toNum(raw);
}

async function fetchRange(range) {
  const url = `${API_BASE}?range=${encodeURIComponent(range)}&limit=${LIMIT}`;
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const json = await resp.json();

  // Normalizacja + twarde przycięcie do LIMIT
  const rows = (Array.isArray(json) ? json : [])
    .filter(x => x && (x.ticker || x.symbol))
    .slice(0, LIMIT)
    .map(x => ({
      ticker: String(x.ticker ?? x.symbol),
      price: pickPrice(x),
      changePercent: pickChangePercent(x),
    }));

  return rows;
}

/* ---------- Rendering ---------- */
function renderBubbles(rows, range) {
  const svg = ensureSVG();
  clearBubbles(); // double-safety

  const W = svg.clientWidth || svg.getBoundingClientRect().width || 1100;
  const H = parseInt(svg.getAttribute('height') || '520', 10);

  // Skala promieni po bezwzględnej zmianie
  const abs = rows.map(r => r.changePercent == null ? 0 : Math.abs(r.changePercent));
  const maxAbs = Math.max(...abs, 0);
  const minR = 24, maxR = 95;
  const rScale = v => (!maxAbs ? minR : minR + (maxR - minR) * (Math.abs(v) / maxAbs));

  // Prosty układ 5x2
  const cols = 5;
  const rowsCount = Math.ceil(rows.length / cols);
  const padX = 28, padY = 36;
  const cellW = (W - padX * 2) / cols;
  const cellH = (H - padY * 2) / Math.max(rowsCount, 1);

  // Tytuł zakresu
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 16);
  title.setAttribute('y', 26);
  title.setAttribute('fill', '#8a8f98');
  title.setAttribute('font-size', '13');
  title.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  title.textContent = `Range: ${range.toUpperCase()} (top ${LIMIT})`;
  svg.appendChild(title);

  rows.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(padX + col * cellW + cellW / 2);
    const cy = Math.round(58 + row * cellH + cellH / 2);

    const r = Math.round(rScale(d.changePercent));
    const color =
      d.changePercent == null ? '#9aa0a6'
      : d.changePercent >= 0 ? '#20a351'
      : '#cf3a35';

    // grupa
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // bubble
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    c.setAttribute('fill', color);
    c.setAttribute('fill-opacity', d.changePercent == null ? '0.10' : '0.20');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', '2');

    // ticker
    const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t1.setAttribute('x', cx);
    t1.setAttribute('y', cy - 2);
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('fill', '#e5e7eb');
    t1.setAttribute('font-weight', '700');
    t1.setAttribute('font-size', '15');
    t1.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    t1.textContent = d.ticker;

    // % change
    const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t2.setAttribute('x', cx);
    t2.setAttribute('y', cy + 16);
    t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('fill', color);
    t2.setAttribute('font-weight', '600');
    t2.setAttribute('font-size', '13');
    t2.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    t2.textContent = (d.changePercent == null) ? 'n/a' : `${d.changePercent.toFixed(2)}%`;

    // tooltip
    const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const priceStr = d.price == null ? 'n/a' : `$${d.price.toFixed(2)}`;
    tip.textContent = `${d.ticker}\nChange: ${t2.textContent}\nPrice: ${priceStr}`;

    g.appendChild(c);
    g.appendChild(t1);
    g.appendChild(t2);
    g.appendChild(tip);
    svg.appendChild(g);
  });

  if (rows.length === 0) {
    const empty = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    empty.setAttribute('x', 16);
    empty.setAttribute('y', 64);
    empty.setAttribute('fill', '#9aa0a6');
    empty.setAttribute('font-size', '14');
    empty.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    empty.textContent = 'No data.';
    svg.appendChild(empty);
  }
}

/* ---------- Load flow ---------- */
async function loadBubbles(range) {
  clearBubbles();

  // lekki „loading”
  const svg = ensureSVG();
  const loading = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  loading.setAttribute('x', 16);
  loading.setAttribute('y', 26);
  loading.setAttribute('fill', '#8a8f98');
  loading.setAttribute('font-size', '13');
  loading.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  loading.textContent = `Loading ${range}…`;
  svg.appendChild(loading);

  try {
    const data = await fetchRange(range);
    renderBubbles(data, range);
  } catch (err) {
    console.error(err);
    clearBubbles();
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', 16);
    t.setAttribute('y', 26);
    t.setAttribute('fill', '#cf3a35');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    t.textContent = `Error: ${err.message || 'failed to load'}`;
    svg.appendChild(t);
  }
}

/* ---------- Tabs wiring ---------- */
function wireTabs() {
  qsa('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      // normalize: honor both lower/upper labels
      const r = (btn.getAttribute('data-range') || '').toLowerCase();
      if (!RANGES.includes(r)) return;
      qsa('[data-range]').forEach(b => b.classList && b.classList.remove('active'));
      btn.classList && btn.classList.add('active');
      loadBubbles(r);
    });
  });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  ensureSVG();
  wireTabs();
  const defaultRange = (qs('[data-range].active')?.getAttribute('data-range') || 'day').toLowerCase();
  loadBubbles(defaultRange);
});
