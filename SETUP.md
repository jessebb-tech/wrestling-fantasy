# NCAA Wrestling Fantasy Draft — Setup Guide

## Stack
- **Frontend:** React + Vite → deployed to Vercel
- **Backend/DB:** Supabase (free tier) — PostgreSQL + Realtime
- **Score fetching:** Vercel cron → `/api/fetch-scores` every 5 minutes

---

## Step 1: Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Once created, open the **SQL Editor**
3. Paste and run the entire contents of `supabase/schema.sql`
4. Copy your credentials from **Project Settings → API:**
   - Project URL
   - `anon` public key
   - `service_role` secret key (keep this private)

---

## Step 2: Seed the Wrestler Pool

Before the draft you need to populate the `wrestlers` table. Use the admin API endpoint after deploying, or run this SQL in Supabase with the bracket data:

```sql
INSERT INTO wrestlers (name, school, weight_class, seed) VALUES
  -- 125 lbs
  ('Nick Suriano', 'Rutgers', 125, 1),
  ('Daton Fix', 'Oklahoma State', 125, 2),
  -- ... fill in from the NCAA bracket
  ;
```

Or POST to `/api/admin` after deploy:
```json
{
  "action": "seed_wrestlers",
  "secret": "YOUR_ADMIN_SECRET",
  "wrestlers": [
    { "name": "Nick Suriano", "school": "Rutgers", "weight_class": 125, "seed": 1 },
    ...
  ]
}
```

The full 2026 bracket will be posted on ncaa.com once seedings are announced (typically day before tournament).

---

## Step 3: Environment Variables

```bash
cp .env.example .env.local
# Fill in your Supabase values
```

---

## Step 4: Local Dev

```bash
npm install
npm run dev
```

App runs at http://localhost:5173

---

## Step 5: Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Set these **Environment Variables** in the Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `CRON_SECRET`
- `ADMIN_SECRET`

The `vercel.json` cron runs `/api/fetch-scores` every 5 minutes automatically.

---

## Step 6: NCAA Score Fetching

⚠️ **This requires a one-time setup step during the tournament.**

NCAA.com serves bracket data through internal API endpoints. To find the correct URL:

1. Open the NCAA bracket: https://www.ncaa.com/brackets/wrestling/d1/2026
2. Open browser DevTools → Network tab → filter by "Fetch/XHR"
3. Look for requests to `data.ncaa.com` — these return the structured bracket JSON
4. Copy that URL and update `NCAA_BRACKET_URL` in `api/fetch-scores.js`
5. Also update `parseNcaaJson()` to match the actual response structure

**Alternative:** Use manual score entry via the admin API if scraping proves unreliable:
```bash
curl -X POST https://your-app.vercel.app/api/admin \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_score",
    "secret": "YOUR_ADMIN_SECRET",
    "wrestler_id": "uuid-here",
    "round": "Semifinals",
    "result_type": "fall",
    "points": 3.5,
    "opponent": "Opponent Name"
  }'
```

---

## Commissioner Flow

1. Share the app URL with all 10 participants
2. Each person creates their spot (first one becomes commissioner)
3. Commissioner clicks **Start Draft** when everyone is in
4. Draft order is randomized automatically
5. After draft completes, scores update automatically during the tournament

---

## Scoring Reference

| Event | Points |
|-------|--------|
| Win by Decision | +1.0 adv |
| Win by Major Decision (8-14 pts) | +1.0 adv + 1.0 bonus = **2.0** |
| Win by Tech Fall (15+ pts) | +1.0 adv + 1.5 bonus = **2.5** |
| Win by Fall (Pin) | +1.0 adv + 2.0 bonus = **3.0** |
| Semifinal win | +1.5 adv |
| Championship win | +3.0 adv |
| Consolation round win | +0.5 adv |
| 3rd place win | +1.5 adv |

Advancement points vary by round; bonus stacks on top.
