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
 * Fetches the top 100 constituents of the S&P 500 index and their
 * realtime prices. Returns a JSON array of objects with `ticker` and
 * `price` fields. If the API key is missing or an error occurs,
 * responds with an appropriate status and message.
 */
app.get('/api/sp500', async (req, res) => {
  const apiKey = process.env.INTRINIO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'INTRINIO_API_KEY is not configured on the server.' });
  }
  try {
    // Identifier for the S&P 500 index in Intrinio. According to Intrinio
    // documentation and examples, the S&P 500 is referenced by the symbol
    // "SPX". See the Index Constituents endpoint description【22675122430142†L690-L702】.
    const indexIdentifier = 'SPX';
    // Build the URL to fetch constituents. Page size limits the number of
    // records returned per page; set to 100 to retrieve the top 100.
    const constituentsUrl = `https://api-v2.intrinio.com/indices/${indexIdentifier}/constituents?page_size=100&api_key=${apiKey}`;
    const constResp = await fetch(constituentsUrl);
    if (!constResp.ok) {
      const text = await constResp.text();
      return res.status(constResp.status).json({ error: `Failed to fetch constituents: ${text}` });
    }
    const constituentsData = await constResp.json();
    // Extract ticker symbols from the constituents list. If the list is
    // shorter than 100, take whatever is available. The API returns an
    // array under the `constituents` property【22675122430142†L726-L739】.
    const tickers = (constituentsData.constituents || [])
      .map(sec => sec.ticker)
      .filter(Boolean)
      .slice(0, 100);
    // For each ticker, fetch the realtime price. Intrinio’s realtime
    // price endpoint returns a rich object; we only need the last_price
    // field【892643411456809†L696-L734】. Use Promise.all to run requests in
    // parallel.
    const pricePromises = tickers.map(async (ticker) => {
      const priceUrl = `https://api-v2.intrinio.com/securities/${ticker}/prices/realtime?api_key=${apiKey}`;
      const priceResp = await fetch(priceUrl);
      if (!priceResp.ok) {
        return { ticker, price: null };
      }
      const priceData = await priceResp.json();
      // Use normal_market_hours_last_price if present; otherwise fall back
      // to last_price. If neither is available, leave null.
      const price = priceData.normal_market_hours_last_price || priceData.last_price || null;
      return { ticker, price };
    });
    const prices = await Promise.all(pricePromises);
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unexpected error fetching SP500 data' });
  }
});

// Serve index.html for all remaining routes (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});