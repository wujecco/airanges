const express = require('express');
const path = require('path');

// fetch w CommonJS przez dynamiczny import
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Serwuj pliki statyczne z katalogu public
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/sp500
 *
 * Zwraca dane dla ~100 spółek S&P 500.
 * Obsługuje parametry:
 *   ?range=day  – zmiana względem poprzedniego dnia (domyślnie)
 *   ?range=week – zmiana względem ceny sprzed tygodnia
 */
app.get('/api/sp500', async (req, res) => {
  const apiKey = process.env.INTRINIO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'INTRINIO_API_KEY is not configured on the server.' });
  }

  // Ustal parametry na podstawie range
  const range = req.query.range === 'week' ? 'week' : 'day';
  const pageSize = range === 'week' ? 6 : 2;       // liczba rekordów do pobrania
  const compareIndex = range === 'week' ? 5 : 1;   // indeks rekordu do porównania

  // Pobierz listę tickerów z slickcharts.com
  async function getTopTickers() {
    const url = 'https://www.slickcharts.com/sp500';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch tickers from ${url}: ${response.statusText}`);
    }
    const html = await response.text();
    const regex = /\/symbol\/([A-Za-z\.]+)"/g;

    const tickers = [];
    const seen = new Set();
    let match;
    while ((match = regex.exec(html)) !== null && tickers.length < 100) {
      const ticker = match[1];
      if (!seen.has(ticker)) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
    return tickers;
  }

  try {
    const tickers = await getTopTickers();

    const pricePromises = tickers.map(async (ticker) => {
      const url = `https://api-v2.intrinio.com/securities/${ticker}/prices?frequency=daily&page_size=${pageSize}&sort_order=desc&api_key=${apiKey}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { ticker, price: null, changePercent: null };

        const data = await resp.json();
        if (!data || !Array.isArray(data.stock_prices) || data.stock_prices.length === 0) {
          return { ticker, price: null, changePercent: null };
        }

        const latest = data.stock_prices[0];
        const prev = data.stock_prices.length > compareIndex ? data.stock_prices[compareIndex] : null;

        const price = latest.close ?? null;
        let changePercent = null;

        if (prev && prev.close != null && prev.close !== 0 && latest.close != null) {
          changePercent = ((latest.close - prev.close) / prev.close) * 100;
        } else if (latest.percent_change !== undefined && latest.percent_change !== null) {
          changePercent = latest.percent_change;
        }

        return { ticker, price, changePercent };
      } catch {
        return { ticker, price: null, changePercent: null };
      }
    });

    const prices = await Promise.all(pricePromises);
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Unexpected error fetching SP500 data' });
  }
});

// Fallback na index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
