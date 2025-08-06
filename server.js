const express = require('express');
const path = require('path');

/*
 * Extend the original simple static server to provide an API endpoint
 * that returns the latest prices for the top 100 constituents of the
 * S&P 500 index. The API key used to access Intrinio is read from
 * the `INTRINIO_API_KEY` environment variable. To avoid exposing
 * secrets, do not commit a `.env` file containing your key. Instead
 * configure the variable in your deployment environment (e.g. Render).
 */

// Node fetch is used to make HTTPS requests. It must be installed as a
// dependency (see package.json). Using an ESM require shim allows it to
// work in CommonJS.
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * GET /api/sp500
 *
 * Responds with a JSON array of objects containing the ticker symbols
 * and latest prices for roughly the top 100 companies in the S&P 500.
 *
 * Instead of relying on Intrinio’s `indices` endpoint—which is only
 * available with certain data packages—this route scrapes a public
 * webpage (https://www.slickcharts.com/sp500) to obtain the list of
 * companies in descending order by index weight. Only the first 100
 * tickers are used. It then queries Intrinio’s realtime price API for
 * each ticker using a 15‑minute delayed source (`delayed_sip`) to avoid
 * exchange fees and leverage the available data packages. Prices are
 * returned as numbers or null if unavailable.
 *
 * The Intrinio API key is read from `INTRINIO_API_KEY` in the
 * environment. If it is not present, the server returns a 500
 * response. All network errors are caught and reported with a 500
 * response.
 */
app.get('/api/sp500', async (req, res) => {
  const apiKey = process.env.INTRINIO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'INTRINIO_API_KEY is not configured on the server.' });
  }

  /**
   * Fetch the HTML for the S&P 500 components page and extract up to 100
   * ticker symbols. The page lists companies in order of index weight.
   * Each ticker appears in a link with a `/symbol/{TICKER}` href, so
   * a simple regex can be used to capture them. Duplicates are
   * filtered to ensure each ticker appears once.
   *
   * @returns {Promise<string[]>} A promise resolving to an array of tickers
   */
  async function getTopTickers() {
    const url = 'https://www.slickcharts.com/sp500';
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch tickers from ${url}: ${response.statusText}`);
    }
    const html = await response.text();
    // Match all instances of /symbol/XYZ where XYZ contains letters or a
    // period (e.g. "BRK.B"). This regex returns the ticker in the first
    // capture group. Because the page contains the tickers twice (once
    // in the company row and once in a dropdown), we filter out
    // duplicates later.
    const regex = /\/symbol\/([A-Za-z\.]+)"/g;
    const tickers = [];
    let match;
    const seen = new Set();
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
    // Fetch the delayed realtime price for each ticker. Using
    // `source=delayed_sip` provides 15‑minute delayed SIP data which is
    // generally accessible under Intrinio’s US stock price packages.
    /*
     * For each ticker, retrieve both the latest realtime price (15‑minute delayed
     * SIP) and the most recent daily price record. The daily price endpoint
     * includes a `percent_change` field representing the percentage change
     * from the previous close【451819717915656†L780-L860】. By requesting only the most
     * recent record, we can use this value directly. If any request
     * fails, nulls are returned for that ticker.
     */
    const pricePromises = tickers.map(async (ticker) => {
      const realtimeUrl =
        `https://api-v2.intrinio.com/securities/${ticker}/prices/realtime?source=delayed_sip&api_key=${apiKey}`;
      const dailyUrl =
        `https://api-v2.intrinio.com/securities/${ticker}/prices?frequency=daily&page_size=1&sort_order=desc&api_key=${apiKey}`;
      try {
        const [realtimeResp, dailyResp] = await Promise.all([
          fetch(realtimeUrl),
          fetch(dailyUrl),
        ]);
        let current = null;
        let changePercent = null;
        // Parse realtime data for current price
        if (realtimeResp.ok) {
          const priceData = await realtimeResp.json();
          current =
            priceData.normal_market_hours_last_price ??
            priceData.last_price ??
            priceData.eod_close_price ??
            null;
        }
        // Parse daily data for percent_change
        if (dailyResp.ok) {
          const dailyData = await dailyResp.json();
          if (
            dailyData &&
            Array.isArray(dailyData.stock_prices) &&
            dailyData.stock_prices.length > 0
          ) {
            const dailyRecord = dailyData.stock_prices[0];
            if (
              dailyRecord.percent_change !== undefined &&
              dailyRecord.percent_change !== null
            ) {
              changePercent = dailyRecord.percent_change;
            } else if (
              dailyRecord.close != null &&
              dailyRecord.prev_close != null &&
              dailyRecord.prev_close !== 0
            ) {
              changePercent =
                ((dailyRecord.close - dailyRecord.prev_close) /
                  dailyRecord.prev_close) *
                100;
            }
          }
        }
        return { ticker, price: current, changePercent };
      } catch (err) {
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

// Serve index.html for all remaining routes (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});