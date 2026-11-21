# Product Search App — Vercel version (no card, fully public link)

This is the same app as before (Shopify + eBay, real data, 200+ products,
working search/filter/sort/buttons) restructured to deploy on **Vercel**
instead of Render — no credit card required, and the link is fully
public (no login needed to view it, unlike GoDaddy's free preview).

## Why the files look different from the Render version
Vercel runs code as **serverless functions** — instead of one server
process running all the time (`app.listen()`), Vercel calls your code
fresh for each request. So the project is split into:
- `app.js` — all the real logic (same endpoints as before)
- `api/index.js` — a tiny file that hands `app.js` to Vercel
- `server.js` — only used if you want to test on your own computer first
- `vercel.json` — tells Vercel to route `/api/*` requests to `api/index.js`
- `public/index.html` — the frontend (unchanged) — Vercel serves this
  automatically as your homepage

You don't need to touch any of this — just upload the whole folder as-is.

## Step 1 — Get your free eBay API keys (same as before)
1. developer.ebay.com → sign up free.
2. Application Keys → copy the **Client ID** and **Client Secret**.

## Step 2 — (Optional) test locally first
```bash
npm install
cp .env.example .env
# paste your keys into .env
npm start
```
Open `http://localhost:3000`.

## Step 3 — Deploy to Vercel (no card)
1. Push this folder to a GitHub repo (same as you already did for the
   other version — you can reuse your GitHub account, just make a new
   repo for this one, or replace the files in the old repo).
2. Go to vercel.com → sign up free (GitHub login works) → "Add New
   Project" → import that repo.
3. Vercel auto-detects the settings — just click "Deploy".
4. Before or after deploying, go to **Project Settings → Environment
   Variables** and add:
   - `EBAY_CLIENT_ID`
   - `EBAY_CLIENT_SECRET`
   Then redeploy (Vercel → Deployments → "..." → Redeploy) so the keys
   take effect.
5. Vercel gives you a public link like `https://your-app.vercel.app` —
   open it, anyone can view it, no login required.

## Note on Vercel's free tier
It's genuinely free for personal projects like this — no card, no time
limit. The only practical limits are on very high traffic (way beyond
what a personal/demo site needs) and a ~10 second max time per request,
which is more than enough for these API calls.

## Everything else is unchanged
Same sources (eBay live, Shopify optional via `SHOPIFY_STORE` in
`public/index.html`), same limitations (Amazon needs affiliate sales
history first, Walmart needs approval, Target/Costco/Sam's
Club/Temu/Alibaba-family have no accessible API) — see the earlier
README from the Render version for the full breakdown.
