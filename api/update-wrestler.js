/**
 * POST /api/update-wrestler
 * Records a match result for a wrestler — adds points, updates round_results,
 * marks eliminated if needed.
 * Uses service role key to bypass RLS.
 */

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

const ADVANCEMENT_POINTS = {
  R64: 1.0, R32: 1.0, R16: 1.0, SF: 1.5, '3rd': 1.5, '1st': 3.0,
  C1: 0.5, C2: 0.5, C3: 0.5, C4: 0.5, C5: 0.5,
}
const WIN_BONUS = {
  fall: 2.0, tech_fall: 1.5, major: 1.0,
  decision: 0.0, bye: 0.0, forfeit: 0.0, medical_ff: 0.0,
}
const CONSOLATION_ROUNDS = ['C1','C2','C3','C4','C5']

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) } }
  catch { return { ok: res.ok, status: res.status, data: text } }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  res.setHeader('Access-Control-Allow-Origin', '*')

  const { wrestler_id, round, result_type, opponent, is_loss, eliminate } = req.body

  if (!wrestler_id || !round || !result_type) {
    return res.status(400).json({ error: 'wrestler_id, round, result_type required' })
  }

  // Fetch current wrestler
  const { ok, data } = await sbFetch(`/wrestlers?id=eq.${wrestler_id}&select=*`)
  if (!ok || !data?.[0]) return res.status(404).json({ error: 'Wrestler not found' })

  const wrestler = data[0]
  const currentResults = wrestler.round_results || []

  // Remove any existing entry for this round (allow re-recording)
  const filtered = currentResults.filter(r => r.round !== round)

  // Build new result entry
  const pointsEarned = is_loss ? 0 : (ADVANCEMENT_POINTS[round] ?? 0) + (WIN_BONUS[result_type] ?? 0)

  const newResult = {
    round,
    result_type,
    opponent: opponent || null,
    points: pointsEarned,
    is_loss: !!is_loss,
    recorded_at: new Date().toISOString(),
  }

  const updatedResults = [...filtered, newResult]

  // Recalculate total from scratch
  const totalPoints = updatedResults
    .filter(r => !r.is_loss)
    .reduce((sum, r) => sum + (r.points || 0), 0)

  // Elimination logic:
  // - Loss in consolation = out
  // - Explicit eliminate flag = out
  // - Loss in C5 = out (last consolation)
  const isEliminated = eliminate === true ||
    (!!is_loss && CONSOLATION_ROUNDS.includes(round))

  const updatePayload = {
    round_results: updatedResults,
    total_points: totalPoints,
    is_eliminated: isEliminated,
    last_updated: new Date().toISOString(),
  }

  const updateRes = await sbFetch(
    `/wrestlers?id=eq.${wrestler_id}`,
    { method: 'PATCH', body: JSON.stringify(updatePayload) }
  )

  if (!updateRes.ok) {
    return res.status(500).json({ error: 'Failed to update wrestler', detail: updateRes.data })
  }

  return res.status(200).json({
    success: true,
    wrestler_id,
    round,
    points_earned: pointsEarned,
    total_points: totalPoints,
    is_eliminated: isEliminated,
  })
}
