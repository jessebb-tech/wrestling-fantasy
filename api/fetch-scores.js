/**
 * Vercel Serverless Function: fetch-scores
 *
 * Called by:
 *   - Vercel Cron (every 5 minutes during tournament)
 *   - Manual GET /api/fetch-scores?secret=YOUR_SECRET
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * LIVE RESULTS SOURCE — READ THIS
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * After researching all available options for 2026:
 *
 * ✗ NCAA.com - React SPA, no public bracket results API
 * ✗ ESPN - No wrestling endpoint in their public API
 * ✗ wrestlingstats.com - Historical PDFs only, not live
 * ✓ FloWrestling/TrackWrestling - Has live results but private auth'd API
 * ✓ Manual entry via /api/admin - Always works, fallback option
 *
 * HOW TO FIND THE FLOWRESTLING API ENDPOINT:
 * 1. Open: https://www.flowrestling.org/nextgen/events/15118822/brackets
 * 2. Open Chrome DevTools → Network tab → filter "Fetch/XHR"
 * 3. Click into a bracket/weight class view
 * 4. Look for requests to *.flosports.tv/* or *.flowrestling.org/api/*
 * 5. Copy the base URL and auth headers, update FLOSPORTS_CONFIG below
 *
 * Until the FloWrestling API is confirmed, this function:
 * 1. Attempts the FloWrestling API (if FLOSPORTS_EVENT_ID is set)
 * 2. Falls back gracefully and logs what to do
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// FloWrestling event ID for 2026 NCAA DI Championships
// Set FLOSPORTS_EVENT_ID=15118822 in Vercel env vars
const FLOSPORTS_EVENT_ID = process.env.FLOSPORTS_EVENT_ID || '15118822'
const FLOSPORTS_API_KEY = process.env.FLOSPORTS_API_KEY || ''  // optional auth key if needed

// Point values — NCAA official scoring
const ROUND_POINTS = {
  'First Round':          1.0,
  'Second Round':         1.0,
  'Quarterfinals':        1.0,
  'Semifinals':           1.5,
  'Championship':         3.0,
  'Third Place':          1.5,
  'Consolation Round 1':  0.5,
  'Consolation Round 2':  0.5,
  'Consolation Round 3':  0.5,
  'Consolation Round 4':  0.5,
  'Consolation Round 5':  0.5,
}

const WIN_BONUS = {
  fall:       2.0,
  tech_fall:  1.5,
  major:      1.0,
  decision:   0.0,
  bye:        0.0,
  forfeit:    0.0,
  default:    0.0,
}

export default async function handler(req, res) {
  const secret = req.headers['authorization']?.replace('Bearer ', '') || req.query.secret
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const results = await fetchResults()
    if (!results || results.length === 0) {
      return res.status(200).json({
        ok: true,
        updated: 0,
        message: 'No results available yet, or FloSports API key not configured. Use /api/admin for manual score entry.',
        timestamp: new Date().toISOString()
      })
    }

    const updated = await updateSupabase(results)
    return res.status(200).json({ ok: true, updated, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('fetch-scores error:', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * Attempt to fetch results from FloWrestling/FloSports API
 * The actual endpoint is determined by inspecting the network requests
 * on the FloWrestling bracket page during the tournament.
 *
 * Common FloSports API patterns (try these in DevTools on tournament day):
 *   https://api.flosports.tv/api/events/{eventId}/brackets
 *   https://api.flosports.tv/api/brackets/{bracketId}/rounds
 *   https://www.flowrestling.org/api/v1/events/{eventId}/results
 */
async function fetchResults() {
  if (!FLOSPORTS_API_KEY) {
    console.log('FLOSPORTS_API_KEY not set — skipping auto-fetch. Use manual entry.')
    return []
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; FantasyWrestlingBot/1.0)',
    'Authorization': `Bearer ${FLOSPORTS_API_KEY}`,
    'Accept': 'application/json',
  }

  // Try known FloSports API patterns
  const endpoints = [
    `https://api.flosports.tv/api/events/${FLOSPORTS_EVENT_ID}/brackets`,
    `https://www.flowrestling.org/api/v1/events/${FLOSPORTS_EVENT_ID}/results`,
    `https://api.flowrestling.org/events/${FLOSPORTS_EVENT_ID}/bout-results`,
  ]

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers })
      if (response.ok) {
        const data = await response.json()
        console.log(`Success fetching from: ${url}`)
        return parseFloSportsResponse(data)
      }
    } catch (e) {
      console.log(`Endpoint ${url} failed: ${e.message}`)
    }
  }

  return []
}

/**
 * Parse FloSports API response into our standard bout result format
 * This is a best-guess scaffold — update based on actual response structure
 * once the API endpoint is confirmed on tournament day.
 */
function parseFloSportsResponse(data) {
  const results = []

  // Common FloSports response shapes to try:
  const bouts = data?.bouts || data?.data?.bouts || data?.results || data?.matches || []

  for (const bout of bouts) {
    if (!bout.winner && !bout.winner_id) continue  // not yet played

    const winnerName = bout.winner?.name || bout.winner_name || ''
    const winnerSchool = bout.winner?.school || bout.winner_school || ''
    const weightClass = parseInt(bout.weight || bout.weight_class || 0)
    const round = bout.round || bout.round_name || ''
    const resultType = normalizeResult(bout.result_type || bout.win_type || bout.decision || '')
    const opponent = bout.loser?.name || bout.loser_name || ''

    if (!winnerName || !weightClass || !round) continue

    const advPoints = ROUND_POINTS[round] ?? 0.5
    const bonusPoints = WIN_BONUS[resultType] ?? 0
    const points = advPoints + bonusPoints

    results.push({ wrestlerName: winnerName, school: winnerSchool, weightClass, round, resultType, opponent, points })
  }

  return results
}

function normalizeResult(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('fall') || s.includes('pin')) return 'fall'
  if (s.includes('tech')) return 'tech_fall'
  if (s.includes('major')) return 'major'
  if (s.includes('decision')) return 'decision'
  if (s.includes('bye')) return 'bye'
  if (s.includes('forfeit') || s.includes('default') || s.includes('ff')) return 'forfeit'
  return 'decision'
}

async function updateSupabase(results) {
  if (results.length === 0) return 0

  const { data: wrestlers } = await supabase
    .from('wrestlers')
    .select('id, name, school, weight_class, total_points')

  let updatedCount = 0

  for (const result of results) {
    const wrestler = findWrestler(wrestlers, result.wrestlerName, result.school, result.weightClass)
    if (!wrestler) {
      console.warn(`No wrestler match: ${result.wrestlerName} (${result.weightClass}lbs)`)
      continue
    }

    // Idempotent: skip if this event already recorded
    const { data: existing } = await supabase
      .from('scoring_events')
      .select('id')
      .eq('wrestler_id', wrestler.id)
      .eq('round', result.round)
      .single()

    if (existing) continue

    await supabase.from('scoring_events').insert({
      wrestler_id: wrestler.id,
      round: result.round,
      result_type: result.resultType,
      opponent: result.opponent,
      points: result.points,
      event_time: new Date().toISOString(),
      source: 'flosports_api'
    })

    const newTotal = (wrestler.total_points || 0) + result.points
    await supabase
      .from('wrestlers')
      .update({ total_points: newTotal, last_updated: new Date().toISOString() })
      .eq('id', wrestler.id)

    updatedCount++
  }

  return updatedCount
}

function findWrestler(wrestlers, name, school, weightClass) {
  if (!name || !weightClass) return null
  const nameLower = name.toLowerCase().trim()

  // Exact match first
  let match = wrestlers.find(w =>
    w.weight_class === weightClass && w.name.toLowerCase() === nameLower
  )
  if (match) return match

  // Last name only
  const lastName = nameLower.split(' ').slice(-1)[0]
  match = wrestlers.find(w =>
    w.weight_class === weightClass && w.name.toLowerCase().includes(lastName)
  )
  return match || null
}
