import { useState } from 'react'
import { WEIGHT_CLASSES } from '../lib/scoring'

const CHAMP_ROUNDS = [
  { key: 'R64', label: 'R1' },
  { key: 'R32', label: 'R2' },
  { key: 'R16', label: 'R3' },
  { key: 'SF',  label: 'SF' },
  { key: '1st', label: 'Finals' },
]
const CONS_ROUNDS = [
  { key: 'C1', label: 'C1' },
  { key: 'C2', label: 'C2' },
  { key: 'C3', label: 'C3' },
  { key: 'C4', label: 'C4' },
  { key: 'C5', label: 'AA' },
]
const ALL_ROUNDS = [...CHAMP_ROUNDS, ...CONS_ROUNDS]

const RESULT_LABELS = {
  fall: 'Fall', tech_fall: 'TF', major: 'MD',
  decision: 'Dec', bye: 'Bye', forfeit: 'FF', medical_ff: 'MFF',
}

const WIN_TYPES = [
  { value: 'decision',  label: 'Decision' },
  { value: 'major',     label: 'Major Decision (+1)' },
  { value: 'tech_fall', label: 'Tech Fall (+1.5)' },
  { value: 'fall',      label: 'Fall / Pin (+2)' },
  { value: 'bye',       label: 'Bye' },
  { value: 'forfeit',   label: 'Forfeit' },
]

export default function BracketView({ wrestlers, picks, owners, isCommissioner }) {
  const [selectedWeight, setSelectedWeight] = useState(125)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Form state
  const [form, setForm] = useState({
    wrestler_id: '',
    round: 'R32',
    result_type: 'decision',
    opponent: '',
    is_loss: false,
    eliminate: false,
  })

  const weightWrestlers = wrestlers
    .filter(w => w.weight_class === selectedWeight)
    .sort((a, b) => (a.seed || 99) - (b.seed || 99))

  // Map wrestler_id → owner name
  const wrestlerOwnerMap = {}
  picks.forEach(p => {
    const owner = owners.find(o => o.id === p.owner_id || o.id === p.owner?.id)
    if (owner) wrestlerOwnerMap[p.wrestler_id] = owner.name
  })

  function getResult(wrestler, roundKey) {
    const results = wrestler.round_results || []
    return results.find(r => r.round === roundKey) || null
  }

  function cellContent(result) {
    if (!result) return <span className="br-empty">–</span>
    if (result.is_loss) return <span className="br-loss">L</span>
    return (
      <span className="br-win">
        W<span className="br-type">{RESULT_LABELS[result.result_type] || ''}</span>
        {result.points > 0 && <span className="br-pts">+{result.points}</span>}
      </span>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    setSaveSuccess('')

    try {
      const res = await fetch('/api/update-wrestler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')

      const w = weightWrestlers.find(w => w.id === form.wrestler_id)
      const action = form.is_loss ? 'Loss recorded' : `+${data.points_earned} pts recorded`
      setSaveSuccess(`${w?.name} — ${action}`)
      setForm(f => ({ ...f, wrestler_id: '', opponent: '', is_loss: false, eliminate: false }))

      // Brief delay then clear success
      setTimeout(() => setSaveSuccess(''), 3000)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bracket-view">
      {/* Weight class selector */}
      <div className="weight-tabs">
        {WEIGHT_CLASSES.map(wc => (
          <button
            key={wc}
            className={`weight-tab ${selectedWeight === wc ? 'active' : ''}`}
            onClick={() => setSelectedWeight(wc)}
          >
            {wc}
          </button>
        ))}
      </div>

      {/* Commissioner update panel */}
      {isCommissioner && (
        <div className="bracket-admin">
          <button
            className={`btn-sm ${showForm ? 'active' : ''}`}
            onClick={() => { setShowForm(f => !f); setSaveError(''); setSaveSuccess('') }}
          >
            {showForm ? '✕ Close' : '+ Record Result'}
          </button>

          {showForm && (
            <form className="result-form card" onSubmit={handleSubmit}>
              <h3>Record Match Result</h3>

              <div className="rf-row">
                <label>Wrestler</label>
                <select
                  value={form.wrestler_id}
                  onChange={e => setForm(f => ({ ...f, wrestler_id: e.target.value }))}
                  required
                >
                  <option value="">— select wrestler —</option>
                  {weightWrestlers.map(w => (
                    <option key={w.id} value={w.id}>
                      #{w.seed} {w.name} ({w.school})
                    </option>
                  ))}
                </select>
              </div>

              <div className="rf-row">
                <label>Round</label>
                <select value={form.round} onChange={e => setForm(f => ({ ...f, round: e.target.value }))}>
                  <optgroup label="Championship">
                    {CHAMP_ROUNDS.map(r => <option key={r.key} value={r.key}>{r.label} ({r.key})</option>)}
                  </optgroup>
                  <optgroup label="Consolation">
                    {CONS_ROUNDS.map(r => <option key={r.key} value={r.key}>{r.label} ({r.key})</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="rf-row">
                <label>Result</label>
                <div className="rf-toggle">
                  <button
                    type="button"
                    className={`rf-btn ${!form.is_loss ? 'win' : ''}`}
                    onClick={() => setForm(f => ({ ...f, is_loss: false }))}
                  >Win</button>
                  <button
                    type="button"
                    className={`rf-btn ${form.is_loss ? 'loss' : ''}`}
                    onClick={() => setForm(f => ({ ...f, is_loss: true }))}
                  >Loss</button>
                </div>
              </div>

              {!form.is_loss && (
                <div className="rf-row">
                  <label>Win type</label>
                  <select value={form.result_type} onChange={e => setForm(f => ({ ...f, result_type: e.target.value }))}>
                    {WIN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}

              {form.is_loss && (
                <div className="rf-row">
                  <label>Eliminated?</label>
                  <label className="rf-check">
                    <input
                      type="checkbox"
                      checked={form.eliminate}
                      onChange={e => setForm(f => ({ ...f, eliminate: e.target.checked }))}
                    />
                    <span>Mark wrestler as eliminated</span>
                  </label>
                  <p className="rf-hint muted">Consolation losses auto-eliminate. Check for early exits.</p>
                </div>
              )}

              <div className="rf-row">
                <label>Opponent <span className="muted">(optional)</span></label>
                <input
                  value={form.opponent}
                  onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
                  placeholder="Opponent name"
                />
              </div>

              {saveError && <p className="error">{saveError}</p>}
              {saveSuccess && <p className="success">{saveSuccess}</p>}

              <button type="submit" className="btn btn-primary" disabled={saving || !form.wrestler_id}>
                {saving ? 'Saving...' : 'Save Result'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Bracket table */}
      <div className="bracket-table-wrap">
        <table className="bracket-table">
          <thead>
            <tr>
              <th className="bt-seed">Seed</th>
              <th className="bt-name">Wrestler</th>
              <th className="bt-owner">Owner</th>
              <th className="bt-pts">Pts</th>
              {ALL_ROUNDS.map(r => (
                <th key={r.key} className={`bt-round ${CONS_ROUNDS.find(c=>c.key===r.key) ? 'cons' : 'champ'}`}>
                  {r.label}
                </th>
              ))}
              <th className="bt-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {weightWrestlers.map(w => {
              const owner = wrestlerOwnerMap[w.id]
              return (
                <tr key={w.id} className={w.is_eliminated ? 'br-row-elim' : ''}>
                  <td className="bt-seed">#{w.seed}</td>
                  <td className="bt-name">
                    <div>{w.name}</div>
                    <div className="bt-school muted">{w.school}</div>
                  </td>
                  <td className="bt-owner">{owner || <span className="muted">—</span>}</td>
                  <td className="bt-pts">{(w.total_points || 0).toFixed(1)}</td>
                  {ALL_ROUNDS.map(r => (
                    <td key={r.key} className="bt-round-cell">
                      {cellContent(getResult(w, r.key))}
                    </td>
                  ))}
                  <td className="bt-status">
                    {w.is_eliminated
                      ? <span className="elim-tag">OUT</span>
                      : <span className="active-tag">Active</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
