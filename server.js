'use strict';
const express = require('express');
const path = require('path');

// Node 18+ ma globalny fetch; fallback dla starszych
const fetch = global.fetch
  ? global.fetch
  : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- static & health -------------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* -------------------- helpers -------------------- */
function nyFormat(d, tz = 'America/New_York') {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).reduce((a, q) => (a[q.type] = q.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}` };
}

// TOP tickery S&P500 (SlickCharts) — zwraca dokładnie `limit`
async function getTopTickers(limit) {
  const resp = await fetch('https://www.slickcharts.com/sp500', { headers: { 'User-Agent': 'airanges/1.0' } });
  if (!resp.ok) throw new Error(`SlickCharts HTTP ${resp.status}`);
  const html = await resp.text();
  const rx = /\/symbol\/([A-Za-z\.]+)"/g; // np. /symbol/AAPL"
  const out = [];
  const seen = new Set();
  let m;
  while ((m = rx.exec(html)) && out.length < limit) {
    const t = m[1];
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  if (!out.length) throw new Error('No S&P500 tickers scraped');
  return out.slice(0, limit);
}

// Ostatni CLOSE z 15m (okno 3 dni, żeby złapać ostatni bar nawet poza godzinami)
async function latest15mClose(ticker, apiKey) {
  const end = new Date();
  const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
  const s = nyFormat(start), e = nyFormat(end);
  const url = `https://api-v2.intrinio.com/securities/${encodeURIComponent(ticker)}/prices/intervals`
    + `?interval_size=15m&source=delayed&timezone=America/New_York`
    + `&start_date=${s.date}&start_time=${s.time}&end_date=${e.date}&end_time=${e.time}`
    + `&split_adjusted=false&include_quote_only_bars=false&page_size=1000&api_key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) return { price: null, intervals: [] };
  const j = await r.json();
  const arr = Array.isArray(j.intervals) ? j.intervals : [];
  const last = arr.length ? arr[arr.length - 1] : null;
  const price = last && typeof last.close === 'number' ? last.close : null;
  return { price, intervals: arr };
}

// Zmiana godzinowa z 15m: ostatni bar vs 5 barów wcześniej (ok. 75 min)
function hourlyChangeFromIntervals(arr) {
  if (!Array.isArray(arr) || arr.length < 6) return { base: null, changePct: null };
  const last = arr[arr.length - 1];
  const base = arr[arr.length - 1 - 5];
  if (!(last && base) || typeof last.close !== 'number' || typeof base.close !== 'number' || base.close === 0) {
    return { base: null, changePct: null };
  }
  return { base: base.close, changePct: ((last.close - base.close) / base.close) * 100 };
}

// Paginowana historia EOD (desc) — bierzemy tyle, ile trzeba
async function fetchEodHistory(ticker, need, apiKey) {
  const all = [];
  let next = null;
  const pageSize = 100;
  do {
    const url = `https://api-v2.intrinio.com/securities/${encodeURIComponent(ticker)}/prices`
      + `?sort_order=desc&page_size=${pageSize}`
      + (next ? `&next_page=${encodeURIComponent(next)}` : ``)
      + `&api_key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json();
    const rows = Array.isArray(j.stock_prices) ? j.stock_prices : [];
    all.push(...rows);
    next = j.next_page || null;
  } while (all.length < need + 1 && next);
  return all;
}

// Zmiana: baza = cena z n-tej sesji wstecz (EOD), „now” = ostatni close 15m
async function eodChangeVsLatest15m(ticker, sessionsBack, apiKey) {
  const hist = await fetchEodHistory(ticker, sessionsBack, apiKey);
  const { price: now } = await latest15mClose(ticker, apiKey);
  if (!hist.length || typeof now !== 'number') return { base: null, now: now ?? null, changePct: null };
  const baseRow = hist.length > sessionsBack ? hist[sessionsBack] : hist[hist.length - 1];
  const base = baseRow && typeof baseRow.close === 'number' ? baseRow.close : null;
  if (!(typeof base === 'number') || base === 0) return { base: null, now, changePct: null };
  return { base, now, changePct: ((now - base) / base) * 100 };
}

/* -------------------- API -------------------- */
app.get('/api/sp500', async (req, res) => {
  const apiKey = process.env.INTRINIO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'INTRINIO_API_KEY missing' });

  const range = (req.query.range || 'day').toLowerCase();
  const limitParam = parseInt(req.query.limit, 10);
  const LIMIT = Math.max(1, Math.min(100, Number.isFinite(limitParam) ? limitParam : 10)); // domyślnie 10
  const CONCURRENCY = Math.min(LIMIT, 10);

  try {
    const tickers = await getTopTickers(LIMIT);

    const worker = async (t) => {
      try {
        if (range === 'hour') {
          const latest = await latest15mClose(t, apiKey);
          const hc = hourlyChangeFromIntervals(latest.intervals);
          return { ticker: t, price: latest.price, changePercent: hc.changePct };
        }
        const sessionsMap = { day: 1, week: 5, month: 21, year: 252 };
        const sb = sessionsMap[range] ?? 1;
        const out = await eodChangeVsLatest15m(t, sb, apiKey);
        return { ticker: t, price: out.now, changePercent: out.changePct };
      } catch {
        return { ticker: t, price: null, changePercent: null };
      }
    };

    // prosta kontrola równoległości
    const out = [];
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await Promise.all(tickers.slice(i, i + CONCURRENCY).map(worker));
      out.push(...batch);
    }

    res.json(out.filter(x => x && x.ticker).slice(0, LIMIT));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to build S&P500 data' });
  }
});

/* -------------------- fallback & start -------------------- */
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`[airanges] listening on :${PORT}`));
