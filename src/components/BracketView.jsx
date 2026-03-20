import { useState } from 'react'
import { WEIGHT_CLASSES } from '../lib/scoring'
import { getRound, getMatchWinner, buildRounds, buildConsRounds } from '../lib/bracket'

// ── Round definitions ──────────────────────────────────────
const CHAMP_ROUNDS = [
  { key: 'R64', label: 'Rd 1' },
  { key: 'R32', label: 'Rd 2' },
  { key: 'R16', label: 'Qtrs' },
  { key: 'SF',  label: 'Semis' },
  { key: '1st', label: 'Final' },
]
const CONS_ROUNDS = [
  { key: 'C1', label: 'C1' },
  { key: 'C2', label: 'C2' },
  { key: 'C3', label: 'C3' },
  { key: 'C4', label: 'C4' },
  { key: 'C5', label: 'AA' },
]
const WIN_TYPES = [
  { value: 'decision',  label: 'Decision' },
  { value: 'major',     label: 'Major (+1)' },
  { value: 'tech_fall', label: 'Tech Fall (+1.5)' },
  { value: 'fall',      label: 'Fall (+2)' },
  { value: 'bye',       label: 'Bye' },
  { value: 'forfeit',   label: 'Forfeit' },
]

// ── Layout constants ───────────────────────────────────────
const SH   = 24
const MG   = 3
const RG   = 7
const MH   = SH * 2 + MG
const UNIT = MH + RG
const HC   = SH + MG / 2
const CW   = 170
const XW   = 40
const HDR  = 26
const BH   = 16 * UNIT
const TH   = HDR + BH + 10

function mCY(ri, mi) {
  const span = 1 << ri
  return mi * UNIT * span + HC + UNIT * (span - 1) / 2
}
function mTY(ri, mi) { return mCY(ri, mi) - HC }

// ── Consolation layout constants ───────────────────────────
const CONS_C    = 8                   // base match count (C1/C2 both have 8)
const CONS_BH   = CONS_C * UNIT
const CONS_TH   = HDR + CONS_BH + 10
const CONS_W    = 5 * CW + 4 * XW + 2
const CONS_VISR = [0, 0, 1, 2, 2]    // visual round index per column

function cCY(ri, mi) {
  const span = 1 << ri
  return mi * UNIT * span + HC + UNIT * (span - 1) / 2
}
function cTY(ri, mi) { return cCY(ri, mi) - HC }

// ── Slot (one wrestler in a match) ────────────────────────
function Slot({ wrestler, isBye, rk, ownerMap }) {
  if (isBye) {
    return (
      <div className="bs-slot bs-bye">
        <span className="bs-empty">BYE</span>
      </div>
    )
  }
  if (!wrestler) {
    return (
      <div className="bs-slot bs-tbd">
        <span className="bs-empty">–</span>
      </div>
    )
  }

  const res    = getRound(wrestler, rk)
  const won    = res && !res.is_loss
  const lost   = res?.is_loss
  const isChamp = rk === '1st' && won
  const owner  = ownerMap[wrestler.id]
  const pts    = res && !res.is_loss
    ? (res.points % 1 ? res.points.toFixed(1) : String(res.points))
    : null

  return (
    <div className={`bs-slot${won ? ' bs-won' : ''}${lost ? ' bs-lost' : ''}${wrestler.is_eliminated ? ' bs-elim' : ''}${isChamp ? ' bs-champ' : ''}`}>
      {isChamp && <span className="bs-champ-icon">🏆</span>}
      <span className="bs-seed">{wrestler.seed}</span>
      <span className="bs-name">{wrestler.name.split(' ').slice(-1)[0]}</span>
      {owner && <span className="bs-own" title={owner}>{owner[0].toUpperCase()}</span>}
      {res && (
        <span className={`bs-res${lost ? ' bs-res-l' : ' bs-res-w'}`}>
          {lost ? 'L' : `+${pts}`}
        </span>
      )}
    </div>
  )
}

// ── Match box ─────────────────────────────────────────────
function MatchBox({ match, ri, mi, ownerMap }) {
  const { top, topBye, bottom, bottomBye, rk } = match
  return (
    <div
      className="bs-match"
      style={{
        position: 'absolute',
        top:  HDR + mTY(ri, mi),
        left: ri * (CW + XW),
        width: CW,
        height: MH,
      }}
    >
      <Slot wrestler={top}    isBye={topBye}    rk={rk} ownerMap={ownerMap} />
      <div className="bs-divider" />
      <Slot wrestler={bottom} isBye={bottomBye} rk={rk} ownerMap={ownerMap} />
    </div>
  )
}

// ── Connector SVG between two rounds ─────────────────────
function Connectors({ ri }) {
  const toCount = 16 >> (ri + 1) // matches in round ri+1
  const mid     = XW / 2
  const paths   = []

  for (let m = 0; m < toCount; m++) {
    const y0 = HDR + mCY(ri,      2 * m)
    const y1 = HDR + mCY(ri,      2 * m + 1)
    const yM = HDR + mCY(ri + 1,  m)
    paths.push(`M0,${y0}H${mid}V${y1}M0,${y1}H${mid}M${mid},${yM}H${XW}`)
  }

  return (
    <svg
      width={XW}
      height={TH}
      style={{
        position: 'absolute',
        left: ri * (CW + XW) + CW,
        top: 0,
        pointerEvents: 'none',
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="var(--border)" strokeWidth="1.5" fill="none" />
      ))}
    </svg>
  )
}

// ── Mobile bracket (round-by-round card view) ─────────────
const WIN_SHORT = {
  fall: 'Fall', tech_fall: 'Tech Fall', major: 'Major Dec.',
  decision: 'Dec.', bye: 'Bye', forfeit: 'Forfeit',
}

function MobileSlot({ wrestler, isBye, rk, isWinner, ownerMap }) {
  if (isBye)     return <div className="mb-slot mb-empty"><span className="muted">BYE</span></div>
  if (!wrestler) return <div className="mb-slot mb-empty"><span className="muted">TBD</span></div>

  const res   = getRound(wrestler, rk)
  const owned = ownerMap[wrestler.id]

  return (
    <div className={`mb-slot${isWinner ? ' mb-winner' : ''}${res?.is_loss ? ' mb-loser' : ''}`}>
      <div className="mb-slot-top">
        <span className="mb-seed">#{wrestler.seed}</span>
        <span className="mb-name">{wrestler.name}</span>
        {owned && <span className="mb-own">{owned.split(' ')[0]}</span>}
      </div>
      {res && !res.is_loss && (
        <div className="mb-result">
          {WIN_SHORT[res.result_type] || res.result_type}
          <span className="mb-pts"> +{res.points % 1 ? res.points.toFixed(1) : res.points} pts</span>
        </div>
      )}
    </div>
  )
}

function MobileBracket({ rounds, ownerMap }) {
  const [selRound, setSelRound] = useState(0)
  const matches = rounds[selRound] || []

  return (
    <div className="mb-wrap">
      <div className="mb-round-tabs">
        {CHAMP_ROUNDS.map((cr, i) => (
          <button
            key={i}
            className={`mb-round-tab${selRound === i ? ' active' : ''}`}
            onClick={() => setSelRound(i)}
          >{cr.label}</button>
        ))}
      </div>

      <div className="mb-matches">
        {matches.map((match, mi) => {
          const winner = getMatchWinner(match)
          const hasResult = winner !== null
          return (
            <div key={mi} className={`mb-match card${hasResult ? ' mb-decided' : ''}`}>
              <MobileSlot wrestler={match.top}    isBye={match.topBye}    rk={match.rk} isWinner={winner === match.top}    ownerMap={ownerMap} />
              <div className="mb-vs">vs</div>
              <MobileSlot wrestler={match.bottom} isBye={match.bottomBye} rk={match.rk} isWinner={winner === match.bottom} ownerMap={ownerMap} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Consolation connectors ─────────────────────────────────

// Straight 1-to-1 connectors (C1→C2 and C4→C5)
function StraightConnectors({ count, visr, colLeft }) {
  const paths = []
  for (let m = 0; m < count; m++) {
    const y = HDR + cCY(visr, m)
    paths.push(`M0,${y}H${XW}`)
  }
  return (
    <svg width={XW} height={CONS_TH}
      style={{ position: 'absolute', left: colLeft, top: 0, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="var(--border)" strokeWidth="1.5" fill="none" />
      ))}
    </svg>
  )
}

// Branching connectors — pairs of left-column matches merge into one right-column match
function BranchConsConnectors({ leftVisr, colLeft }) {
  const leftCount = CONS_C >> leftVisr   // 8 → 4 → 2
  const toCount   = leftCount / 2
  const mid       = XW / 2
  const paths     = []
  for (let m = 0; m < toCount; m++) {
    const y0 = HDR + cCY(leftVisr,     2 * m)
    const y1 = HDR + cCY(leftVisr,     2 * m + 1)
    const yM = HDR + cCY(leftVisr + 1, m)
    paths.push(`M0,${y0}H${mid}V${y1}M0,${y1}H${mid}M${mid},${yM}H${XW}`)
  }
  return (
    <svg width={XW} height={CONS_TH}
      style={{ position: 'absolute', left: colLeft, top: 0, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="var(--border)" strokeWidth="1.5" fill="none" />
      ))}
    </svg>
  )
}

// ── Consolation bracket (SVG visual) ─────────────────────
const CONS_ROUND_LABELS = ['C1', 'C2', 'C3', 'C4', 'AA']

function ConsolationBracket({ wrestlers, ownerMap }) {
  const consRounds = buildConsRounds(wrestlers)

  return (
    <div className="bs-scroll">
      <div style={{ position: 'relative', width: CONS_W, height: CONS_TH }}>

        {/* Column headers */}
        {CONS_ROUND_LABELS.map((label, ci) => (
          <div key={ci} className="bs-col-hdr"
            style={{ position: 'absolute', left: ci * (CW + XW), top: 0, width: CW }}
          >{label}</div>
        ))}

        {/* Match boxes */}
        {consRounds.map((matches, ci) => {
          const visr = CONS_VISR[Math.min(ci, 4)]
          return matches.map((match, mi) => (
            <div key={`${ci}-${mi}`} className="bs-match" style={{
              position: 'absolute',
              top:  HDR + cTY(visr, mi),
              left: ci * (CW + XW),
              width: CW,
              height: MH,
            }}>
              <Slot wrestler={match.top}    isBye={false} rk={match.rk} ownerMap={ownerMap} />
              <div className="bs-divider" />
              <Slot wrestler={match.bottom} isBye={false} rk={match.rk} ownerMap={ownerMap} />
            </div>
          ))
        })}

        {/* C1 → C2: straight connectors */}
        <StraightConnectors count={8} visr={0} colLeft={0 * (CW + XW) + CW} />

        {/* C2 → C3: branching connectors */}
        <BranchConsConnectors leftVisr={0} colLeft={1 * (CW + XW) + CW} />

        {/* C3 → C4: branching connectors */}
        <BranchConsConnectors leftVisr={1} colLeft={2 * (CW + XW) + CW} />

        {/* C4 → C5: straight connectors */}
        <StraightConnectors count={2} visr={2} colLeft={3 * (CW + XW) + CW} />

      </div>
    </div>
  )
}

// ── Main BracketView component ────────────────────────────
export default function BracketView({ wrestlers, picks, owners, isCommissioner }) {
  const [selWeight, setSelWeight] = useState(125)
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState('')
  const [saveOk,   setSaveOk]   = useState('')
  const [form, setForm] = useState({
    wrestler_id: '', round: 'R32', result_type: 'decision',
    opponent: '', is_loss: false, eliminate: false,
  })

  const ww = wrestlers
    .filter(w => w.weight_class === selWeight)
    .sort((a, b) => (a.seed || 99) - (b.seed || 99))

  // wrestler_id → owner name
  const ownerMap = {}
  picks.forEach(p => {
    const o = owners.find(o => o.id === p.owner_id || o.id === p.owner?.id)
    if (o) ownerMap[p.wrestler_id] = o.name
  })

  const rounds   = buildRounds(ww)
  const totalW   = 5 * CW + 4 * XW + 2

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setSaveErr(''); setSaveOk('')
    try {
      const res  = await fetch('/api/update-wrestler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      const w = ww.find(w => w.id === form.wrestler_id)
      setSaveOk(`${w?.name} — ${form.is_loss ? 'Loss recorded' : `+${data.points_earned} pts`}`)
      setForm(f => ({ ...f, wrestler_id: '', opponent: '', is_loss: false, eliminate: false }))
      setTimeout(() => setSaveOk(''), 3000)
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bracket-view">

      {/* ── Weight class tabs ── */}
      <div className="weight-tabs">
        {WEIGHT_CLASSES.map(wc => (
          <button
            key={wc}
            className={`weight-tab ${selWeight === wc ? 'active' : ''}`}
            onClick={() => setSelWeight(wc)}
          >{wc}</button>
        ))}
      </div>

      {/* ── Commissioner record-result form ── */}
      {isCommissioner && (
        <div className="bracket-admin">
          <button
            className={`btn-sm ${showForm ? 'active' : ''}`}
            onClick={() => { setShowForm(f => !f); setSaveErr(''); setSaveOk('') }}
          >{showForm ? '✕ Close' : '+ Record Result'}</button>

          {showForm && (
            <form className="result-form card" onSubmit={handleSubmit}>
              <h3>Record Match Result</h3>

              <div className="rf-row">
                <label>Wrestler</label>
                <select value={form.wrestler_id} onChange={e => setForm(f => ({ ...f, wrestler_id: e.target.value }))} required>
                  <option value="">— select —</option>
                  {ww.map(w => (
                    <option key={w.id} value={w.id}>#{w.seed} {w.name} ({w.school})</option>
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
                  <button type="button" className={`rf-btn ${!form.is_loss ? 'win' : ''}`}
                    onClick={() => setForm(f => ({ ...f, is_loss: false }))}>Win</button>
                  <button type="button" className={`rf-btn ${form.is_loss ? 'loss' : ''}`}
                    onClick={() => setForm(f => ({ ...f, is_loss: true }))}>Loss</button>
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
                    <input type="checkbox" checked={form.eliminate}
                      onChange={e => setForm(f => ({ ...f, eliminate: e.target.checked }))} />
                    <span>Mark as eliminated</span>
                  </label>
                  <p className="rf-hint muted">Consolation losses auto-eliminate.</p>
                </div>
              )}

              <div className="rf-row">
                <label>Opponent <span className="muted">(optional)</span></label>
                <input value={form.opponent}
                  onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
                  placeholder="Opponent name" />
              </div>

              {saveErr && <p className="error">{saveErr}</p>}
              {saveOk  && <p className="success">{saveOk}</p>}

              <button type="submit" className="btn btn-primary" disabled={saving || !form.wrestler_id}>
                {saving ? 'Saving…' : 'Save Result'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── Championship bracket ── */}
      <div className="bs-section-hdr">Championship Bracket</div>

      <div className="bs-scroll">
        <div style={{ position: 'relative', width: totalW, height: TH }}>

          {/* Column headers */}
          {CHAMP_ROUNDS.map((cr, ri) => (
            <div
              key={ri}
              className="bs-col-hdr"
              style={{ position: 'absolute', left: ri * (CW + XW), top: 0, width: CW }}
            >
              {cr.label}
            </div>
          ))}

          {/* Match boxes */}
          {rounds.map((matches, ri) =>
            matches.map((match, mi) => (
              <MatchBox key={`${ri}-${mi}`} match={match} ri={ri} mi={mi} ownerMap={ownerMap} />
            ))
          )}

          {/* Connector SVGs (between rounds 0-1, 1-2, 2-3, 3-4) */}
          {[0, 1, 2, 3].map(ri => <Connectors key={ri} ri={ri} />)}
        </div>
      </div>

      {/* ── Consolation bracket ── */}
      <div className="bs-section-hdr" style={{ marginTop: 28 }}>Consolation Bracket</div>
      <ConsolationBracket wrestlers={ww} ownerMap={ownerMap} />

    </div>
  )
}
