/**
 * Admin API — protected routes for commissioner actions
 * POST /api/admin
 * Body: { action, secret, ...params }
 *
 * Actions:
 *   - add_wrestler:    add a wrestler to the pool
 *   - seed_wrestlers:  bulk import wrestlers (JSON array)
 *   - update_score:    manually update a wrestler's points
 *   - reset_draft:     reset to pending state (use carefully!)
 *   - set_timer:       set pick timer seconds
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, secret, ...params } = req.body

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    switch (action) {
      case 'add_wrestler':
        return res.json(await addWrestler(params))

      case 'seed_wrestlers':
        return res.json(await seedWrestlers(params.wrestlers))

      case 'update_score':
        return res.json(await updateScore(params))

      case 'reset_draft':
        return res.json(await resetDraft())

      case 'set_timer':
        return res.json(await setTimer(params.seconds))

      case 'eliminate_wrestler':
        return res.json(await eliminateWrestler(params.wrestler_id))

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function addWrestler({ name, school, weight_class, seed }) {
  const { data, error } = await supabase
    .from('wrestlers')
    .insert({ name, school, weight_class, seed })
    .select()
    .single()
  if (error) throw error
  return { ok: true, wrestler: data }
}

async function seedWrestlers(wrestlers) {
  // wrestlers: [{ name, school, weight_class, seed }]
  const { data, error } = await supabase
    .from('wrestlers')
    .upsert(wrestlers, { onConflict: 'name,weight_class' })
    .select()
  if (error) throw error
  return { ok: true, count: data.length }
}

async function updateScore({ wrestler_id, round, result_type, points, opponent }) {
  // Insert scoring event
  const { error: evErr } = await supabase.from('scoring_events').insert({
    wrestler_id,
    round,
    result_type,
    points,
    opponent,
    source: 'manual'
  })
  if (evErr) throw evErr

  // Recalculate total from all events
  const { data: events } = await supabase
    .from('scoring_events')
    .select('points')
    .eq('wrestler_id', wrestler_id)

  const total = events.reduce((s, e) => s + e.points, 0)

  const { error: upErr } = await supabase
    .from('wrestlers')
    .update({ total_points: total, last_updated: new Date().toISOString() })
    .eq('id', wrestler_id)

  if (upErr) throw upErr
  return { ok: true, total_points: total }
}

async function resetDraft() {
  await supabase.from('picks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('owners').update({ draft_order: null }).neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('draft_session').update({
    status: 'pending',
    current_pick: 1,
    started_at: null,
    completed_at: null
  }).eq('id', 1)
  return { ok: true }
}

async function setTimer(seconds) {
  const { error } = await supabase
    .from('draft_session')
    .update({ pick_timer_secs: parseInt(seconds) })
    .eq('id', 1)
  if (error) throw error
  return { ok: true, pick_timer_secs: seconds }
}

async function eliminateWrestler(wrestler_id) {
  const { error } = await supabase
    .from('wrestlers')
    .update({ is_eliminated: true })
    .eq('id', wrestler_id)
  if (error) throw error
  return { ok: true }
}
