// Core app logic — same endpoints as before, but exported as an Express
// app object instead of calling app.listen(). This lets the exact same
// code run two ways:
//   - locally / on Render / on GoDaddy: server.js calls app.listen()
//   - on Vercel: api/index.js hands this app straight to Vercel's
//     serverless runtime, which calls it per-request instead of
//     keeping a process running 24/7.
//
// Endpoints (same as before):
//   GET /api/shopify-products?store=<domain>&q=<search>&page=<n>&limit=<n>
//   GET /api/ebay-search?q=<search>&limit=<n>&offset=<n>
//   GET /api/search?q=<search>&store=<optional>&limit=<n>&offset=<n>
//   GET /api/homepage?store=<optional>&limit=<n>
//   GET /api/status

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const HOMEPAGE_CATEGORIES = [
  "electronics", "fashion", "home decor", "kitchen", "toys",
  "beauty", "sports equipment", "shoes", "furniture", "watches",
  "bags", "jewelry", "fitness gear", "tools", "phone accessories",
];

function dedupe(products) {
  const seen = new Set();
  return products.filter((p) => {
    const key = `${p.source}::${p.title}::${p.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanProducts(products) {
  return products.filter((p) => p.title && p.price != null && p.image && p.url);
}

// ---------- Shopify ----------
async function fetchShopify({ store, q, page = 1, limit = 100 }) {
  const safeLimit = Math.min(parseInt(limit, 10) || 100, 250);
  const url = `https://${store}/products.json?limit=${safeLimit}&page=${page}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Shopify store returned ${response.status}`);

  const data = await response.json();
  let products = (data.products || []).map((p) => {
    const variant = p.variants && p.variants[0];
    const image = p.images && p.images[0] ? p.images[0].src : null;
    return {
      title: p.title,
      price: variant ? parseFloat(variant.price) : null,
      currency: null,
      image,
      url: `https://${store}/products/${p.handle}`,
      source: store,
    };
  });

  if (q) {
    const needle = q.toLowerCase();
    products = products.filter((p) => p.title.toLowerCase().includes(needle));
  }
  return products;
}

app.get("/api/shopify-products", async (req, res) => {
  const { store, q, page, limit } = req.query;
  if (!store) return res.status(400).json({ error: "Missing ?store=yourstore.myshopify.com" });
  try {
    const products = cleanProducts(await fetchShopify({ store, q, page, limit }));
    res.json({ count: products.length, products });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch Shopify products", details: err.message });
  }
});

// ---------- eBay ----------
let ebayToken = null;
let ebayTokenExpiry = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiry) return ebayToken;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET environment variables");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });

  if (!response.ok) throw new Error(`eBay auth failed: ${response.status} ${await response.text()}`);

  const data = await response.json();
  ebayToken = data.access_token;
  ebayTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return ebayToken;
}

async function fetchEbay({ q, limit = 50, offset = 0 }) {
  const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);
  const token = await getEbayToken();
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${safeLimit}&offset=${offset}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" },
  });
  if (!response.ok) throw new Error(`eBay API error ${response.status}: ${await response.text()}`);

  const data = await response.json();
  return (data.itemSummaries || []).map((item) => ({
    title: item.title,
    price: item.price ? parseFloat(item.price.value) : null,
    currency: item.price ? item.price.currency : null,
    image: item.image ? item.image.imageUrl : null,
    url: item.itemWebUrl,
    source: "eBay",
  }));
}

app.get("/api/ebay-search", async (req, res) => {
  const { q, limit, offset } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q=search term" });
  try {
    const products = cleanProducts(await fetchEbay({ q, limit, offset }));
    res.json({ count: products.length, products });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch eBay results", details: err.message });
  }
});

// ---------- Combined search ----------
app.get("/api/search", async (req, res) => {
  const { q, store, limit, offset } = req.query;
  if (!q) return res.status(400).json({ error: "Missing ?q=search term" });

  const results = [];
  const errors = [];

  await Promise.all([
    fetchEbay({ q, limit, offset }).then((r) => results.push(...r)).catch((e) => errors.push({ source: "eBay", message: e.message })),
    store
      ? fetchShopify({ store, q, limit }).then((r) => results.push(...r)).catch((e) => errors.push({ source: store, message: e.message }))
      : Promise.resolve(),
  ]);

  const products = cleanProducts(dedupe(results)).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  res.json({ count: products.length, products, errors: errors.length ? errors : undefined });
});

// ---------- Homepage feed ----------
app.get("/api/homepage", async (req, res) => {
  const { store, limit } = req.query;
  const target = parseInt(limit, 10) || 200;
  const results = [];
  const errors = [];
  const perCategory = Math.ceil(target / HOMEPAGE_CATEGORIES.length) + 5;

  await Promise.all(
    HOMEPAGE_CATEGORIES.map((category) =>
      fetchEbay({ q: category, limit: perCategory })
        .then((r) => results.push(...r))
        .catch((e) => errors.push({ source: `eBay:${category}`, message: e.message }))
    )
  );

  if (store) {
    try {
      results.push(...(await fetchShopify({ store, limit: 250 })));
    } catch (e) {
      errors.push({ source: store, message: e.message });
    }
  }

  const products = cleanProducts(dedupe(results)).slice(0, target);
  res.json({ count: products.length, products, errors: errors.length ? errors : undefined });
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    sources_live: ["eBay", "Shopify (pass ?store=)"],
    sources_pending: ["Walmart (needs affiliate approval)"],
    sources_unavailable: ["Amazon", "Target", "Costco", "Sam's Club", "Temu", "Alibaba", "AliExpress", "Daraz"],
  });
});

module.exports = app;
