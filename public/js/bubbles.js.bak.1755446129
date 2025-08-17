/* airanges – bubbles.js (2nd row tabs ready)
 * - Fetches exactly 10 tickers per tab (hour/day/week/month/year)
 * - Clears previous bubbles before rendering (no accumulation)
 * - Plain SVG, no external libs
 */

const RANGES = ['hour', 'day', 'week', 'month', 'year'];
const API_BASE = '/api/sp500';
const LIMIT = 10;

// ---------- DOM helpers ----------
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Ensure we have an SVG to draw into. Prefer <svg id="bubbles"> if present; otherwise create one.
function ensureSVG() {
  let svg = qs('svg#bubbles') || qs('#bubbles svg') || qs('svg');
  const container = qs('#bubbles') || document.body;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'bubbles');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '520');
    svg.style.display = 'block';
    svg.style.maxWidth = '1200px';
    svg.style.margin = '0 auto';
    container.appendChild(svg);
  }
  return svg;
}

// Remove all prior nodes from SVG / container to avoid accumulation between tabs
function clearBubbles() {
  const svg = ensureSVG();
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  // If someone renders into a div container, clear it too:
  const container = qs('#bubbles');
  if (container && container !== svg && container.childElementCount > 0) {
    // leave svg in place (already cleared), remove other children
    qsa(':scope > :not(svg)', container).forEach(n => n.remove());
  }
}

// ---------- Data fetch ----------
async function fetchRange(range) {
  const url = `${API_BASE}?range=${encodeURIComponent(range)}&limit=${LIMIT}`;
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const json = await resp.json();
  // Normalize and hard-trim to 10
  return (Array.isArray(json) ? json : [])
    .filter(d => d && d.ticker) // require ticker
    .slice(0, LIMIT)
    .map(d => ({
      ticker: String(d.ticker),
      price: Number.isFinite(d.price) ? d.price : null,
      changePercent: Number.isFinite(d.changePercent) ? d.changePercent : null
    }));
}

// ---------- Rendering ----------
function renderBubbles(rows, range) {
  const svg = ensureSVG();
  clearBubbles(); // safety double-clear (cheap)

  const W = svg.clientWidth || svg.getBoundingClientRect().width || 1000;
  const H = parseInt(svg.getAttribute('height') || '520', 10);

  // Compute radii from abs(change) with sane min/max
  const absChanges = rows.map(r => r.changePercent == null ? 0 : Math.abs(r.changePercent));
  const maxAbs = Math.max( ...absChanges, 0 );
  const minR = 26;   // minimum radius
  const maxR = 90;   // maximum radius
  const scaleR = (v) => {
    if (!maxAbs || v == null) return minR;
    return minR + (maxR - minR) * (v / maxAbs);
  };

  // Simple grid layout for up to 10 bubbles (5 x 2)
  const cols = 5;
  const rowsCount = Math.ceil(rows.length / cols);
  const padX = 24, padY = 24;
  const cellW = (W - padX * 2) / cols;
  const cellH = (H - padY * 2) / Math.max(rowsCount, 1);

  // Title
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 16);
  title.setAttribute('y', 28);
  title.setAttribute('fill', '#666');
  title.setAttribute('font-size', '14');
  title.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  title.textContent = `Range: ${range.toUpperCase()} (top ${LIMIT})`;
  svg.appendChild(title);

  rows.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = Math.round(padX + col * cellW + cellW / 2);
    const cy = Math.round(54 + row * cellH + cellH / 2); // 54 to leave room for title
    const r = Math.round(scaleR(Math.abs(d.changePercent)));

    const color = d.changePercent == null
      ? '#9aa0a6'         // gray for missing
      : (d.changePercent >= 0 ? '#1a7f37' : '#c0362c'); // green / red

    // Group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Circle (bubble)
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    c.setAttribute('fill', color);
    c.setAttribute('fill-opacity', '0.18');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', '2');

    // Label: ticker
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', cy - 2);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', '#111');
    label.setAttribute('font-weight', '700');
    label.setAttribute('font-size', '14');
    label.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    label.textContent = d.ticker;

    // Label: % change
    const pct = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    pct.setAttribute('x', cx);
    pct.setAttribute('y', cy + 16);
    pct.setAttribute('text-anchor', 'middle');
    pct.setAttribute('fill', color);
    pct.setAttribute('font-weight', '600');
    pct.setAttribute('font-size', '13');
    pct.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    const val = d.changePercent == null ? '—' : `${d.changePercent.toFixed(2)}%`;
    pct.textContent = val;

    // Tooltip on hover
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const priceStr = (d.price == null) ? 'n/a' : `$${Number(d.price).toFixed(2)}`;
    t.textContent = `${d.ticker}\nChange: ${val}\nPrice: ${priceStr}`;

    g.appendChild(c);
    g.appendChild(label);
    g.appendChild(pct);
    g.appendChild(t);
    svg.appendChild(g);
  });

  // Empty state
  if (rows.length === 0) {
    const empty = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    empty.setAttribute('x', 16);
    empty.setAttribute('y', 60);
    empty.setAttribute('fill', '#999');
    empty.setAttribute('font-size', '14');
    empty.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    empty.textContent = 'No data.';
    svg.appendChild(empty);
  }
}

// ---------- Loading flow ----------
async function loadBubbles(range) {
  // Clear previous frame immediately (avoid accumulation)
  clearBubbles();

  // Show lightweight "loading" text
  const svg = ensureSVG();
  const loading = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  loading.setAttribute('x', 16);
  loading.setAttribute('y', 28);
  loading.setAttribute('fill', '#666');
  loading.setAttribute('font-size', '14');
  loading.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
  loading.textContent = `Loading ${range}…`;
  svg.appendChild(loading);

  try {
    const data = await fetchRange(range);
    renderBubbles(data, range);
  } catch (err) {
    console.error(err);
    clearBubbles();
    const errorText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    errorText.setAttribute('x', 16);
    errorText.setAttribute('y', 28);
    errorText.setAttribute('fill', '#c0362c');
    errorText.setAttribute('font-size', '14');
    errorText.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
    errorText.textContent = `Error: ${err.message || 'failed to load'}`;
    svg.appendChild(errorText);
  }
}

// ---------- Tabs wiring ----------
function wireTabs() {
  // Any element with [data-range] (e.g., buttons) becomes a trigger
  qsa('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = btn.getAttribute('data-range');
      if (!RANGES.includes(r)) return;
      // Active state (optional)
      qsa('[data-range]').forEach(b => b.classList && b.classList.remove('active'));
      btn.classList && btn.classList.add('active');
      // Load
      loadBubbles(r);
    });
  });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  ensureSVG();
  wireTabs();
  // Initial default range
  const defaultRange = (qs('[data-range].active')?.getAttribute('data-range')) || 'day';
  loadBubbles(defaultRange);
});
