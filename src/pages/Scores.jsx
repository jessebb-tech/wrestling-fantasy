import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOwners } from '../hooks/useOwners'
import { usePicks } from '../hooks/usePicks'
import { useWrestlers } from '../hooks/useWrestlers'
import { WEIGHT_CLASSES } from '../lib/scoring'
import { getUpcomingMatchups } from '../lib/bracket'
import BracketView from '../components/BracketView'

export default function Scores() {
  const navigate = useNavigate()
  const { owners } = useOwners()
  const { picks } = usePicks()
  const { wrestlers } = useWrestlers()
  const [view, setView] = useState('leaderboard') // 'leaderboard' | 'by_weight' | 'team' | 'brackets'
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const ownerId = localStorage.getItem('owner_id')

  useEffect(() => {
    if (!ownerId) navigate('/')
  }, [ownerId, navigate])

  // Check if current user is commissioner
  const currentOwner = owners.find(o => o.id === ownerId)
  const isCommissioner = currentOwner?.is_commissioner === true

  useEffect(() => {
    if (wrestlers.length > 0) {
      const latest = wrestlers
        .filter(w => w.last_updated)
        .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))[0]
      if (latest) setLastUpdated(latest.last_updated)
    }
  }, [wrestlers])

  // Build owner scores
  const ownerScores = owners
    .filter(o => o.draft_order)
    .map(owner => {
      const ownerPicks = picks.filter(p => p.owner?.id === owner.id)
      const totalPoints = ownerPicks.reduce((sum, p) => {
        const wrestler = wrestlers.find(w => w.id === p.wrestler_id)
        return sum + (wrestler?.total_points || 0)
      }, 0)
      return { ...owner, picks: ownerPicks, totalPoints }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)

  const myOwner = ownerScores.find(o => o.id === ownerId)

  function handleSelectOwner(owner) {
    setSelectedOwner(owner)
    setView('team')
  }

  function handleBackToLeaderboard() {
    setView('leaderboard')
    setSelectedOwner(null)
  }

  return (
    <div className="scores-page">
      <header className="scores-header">
        <div className="scores-header-left">
          <img src="/logo.png" alt="Wrestle Org" className="header-logo" />
          <h1>Scores</h1>
        </div>
        <div className="scores-header-nav">
          <button
            className={`tab-btn ${view === 'leaderboard' ? 'active' : ''}`}
            onClick={() => { setView('leaderboard'); setSelectedOwner(null) }}
          >Leaderboard</button>
          <button
            className={`tab-btn ${view === 'by_weight' ? 'active' : ''}`}
            onClick={() => { setView('by_weight'); setSelectedOwner(null) }}
          >By Weight</button>
          {myOwner && (
            <button
              className={`tab-btn ${view === 'team' && selectedOwner?.id === myOwner.id ? 'active' : ''}`}
              onClick={() => handleSelectOwner(myOwner)}
            >My Team</button>
          )}
          <button
            className={`tab-btn ${view === 'brackets' ? 'active' : ''}`}
            onClick={() => { setView('brackets'); setSelectedOwner(null) }}
          >Brackets</button>
          <button className="btn-sm" onClick={() => navigate('/draft')}>Draft</button>
        </div>
      </header>

      {lastUpdated && (
        <div className="update-banner">
          Scores last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}

      {view === 'leaderboard' && (
        <Leaderboard
          ownerScores={ownerScores}
          ownerId={ownerId}
          onSelectOwner={handleSelectOwner}
          wrestlers={wrestlers}
          picks={picks}
          owners={owners}
        />
      )}
      {view === 'by_weight' && <ByWeight picks={picks} wrestlers={wrestlers} owners={owners} />}
      {view === 'brackets' && (
        <BracketView
          wrestlers={wrestlers}
          picks={picks}
          owners={owners}
          isCommissioner={isCommissioner}
        />
      )}
      {view === 'team' && selectedOwner && (
        <TeamRoster
          owner={selectedOwner}
          wrestlers={wrestlers}
          rank={ownerScores.findIndex(o => o.id === selectedOwner.id) + 1}
          isMe={selectedOwner.id === ownerId}
          onBack={handleBackToLeaderboard}
        />
      )}
    </div>
  )
}

const ROUND_LABELS_SHORT = {
  R64: 'Rd 1', R32: 'Rd 2', R16: 'Qtrs', SF: 'Semis', '1st': 'Finals', '3rd': '3rd Place',
  C1: 'Con 1', C2: 'Con 2', C3: 'Con 3', C4: 'Con 4', C5: 'All-American',
}
const WIN_TYPE_SHORT = {
  fall: 'Fall', tech_fall: 'Tech Fall', major: 'Major', decision: 'Dec', bye: 'Bye', forfeit: 'Forfeit',
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ActivityFeed({ wrestlers, picks, owners }) {
  // Build owner map: wrestler_id → owner name
  const ownerMap = {}
  picks.forEach(p => {
    const o = owners.find(o => o.id === p.owner?.id || o.id === p.owner_id)
    if (o) ownerMap[p.wrestler_id] = o.name
  })

  // Upcoming head-to-head matchups across all weight classes
  const h2h = []
  WEIGHT_CLASSES.forEach(wc => {
    const ww = wrestlers.filter(w => w.weight_class === wc)
    const matchups = getUpcomingMatchups(ww, ownerMap, wc)
    matchups.filter(m => m.isH2H).forEach(m => h2h.push(m))
  })

  // Flatten all round_results into a single feed
  const events = []
  wrestlers.forEach(w => {
    const pick  = picks.find(p => p.wrestler_id === w.id)
    const owner = pick ? owners.find(o => o.id === pick.owner?.id || o.id === pick.owner_id) : null
    ;(w.round_results || []).forEach(r => {
      events.push({ wrestler: w, owner, result: r })
    })
  })

  events.sort((a, b) => new Date(b.result.recorded_at) - new Date(a.result.recorded_at))
  const feed = events.slice(0, 20)

  if (feed.length === 0 && h2h.length === 0) {
    return (
      <div className="activity-feed">
        <div className="af-header">Recent Results</div>
        <p className="muted af-empty">No results recorded yet — check back once the tournament starts.</p>
      </div>
    )
  }

  return (
    <div className="activity-feed">

      {/* ── Head-to-head matchups ── */}
      {h2h.length > 0 && (
        <div className="h2h-section">
          <div className="af-header">⚔️ Head-to-Head Matchups</div>
          <div className="h2h-list">
            {h2h.map((m, i) => (
              <div key={i} className="h2h-row card">
                <div className="h2h-round">{ROUND_LABELS_SHORT[m.round] || m.round} · {m.weightClass} lbs</div>
                <div className="h2h-matchup">
                  <div className="h2h-side">
                    <span className="h2h-owner">{m.ownerTop}</span>
                    <span className="h2h-wrestler">#{m.top.seed} {m.top.name}</span>
                  </div>
                  <div className="h2h-vs">VS</div>
                  <div className="h2h-side h2h-right">
                    <span className="h2h-owner">{m.ownerBottom}</span>
                    <span className="h2h-wrestler">#{m.bottom.seed} {m.bottom.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent results ── */}
      {feed.length > 0 && <div className="af-header">Recent Results</div>}
      <div className="af-list">
        {feed.map(({ wrestler, owner, result }, i) => (
          <div key={i} className={`af-row ${result.is_loss ? 'af-loss' : 'af-win'}`}>
            <div className={`af-badge ${result.is_loss ? 'af-badge-l' : 'af-badge-w'}`}>
              {result.is_loss ? 'L' : 'W'}
            </div>
            <div className="af-body">
              <div className="af-top">
                <span className="af-wrestler">{wrestler.name}</span>
                {owner && <span className="af-owner muted">({owner.name})</span>}
              </div>
              <div className="af-sub muted">
                <span>{ROUND_LABELS_SHORT[result.round] || result.round}</span>
                <span className="af-dot">·</span>
                <span>{wrestler.weight_class} lbs</span>
                {!result.is_loss && (
                  <>
                    <span className="af-dot">·</span>
                    <span>{WIN_TYPE_SHORT[result.result_type] || result.result_type}</span>
                  </>
                )}
                {result.opponent && (
                  <>
                    <span className="af-dot">·</span>
                    <span>vs {result.opponent}</span>
                  </>
                )}
              </div>
            </div>
            <div className="af-right">
              {!result.is_loss && (
                <div className="af-pts">+{result.points % 1 ? result.points.toFixed(1) : result.points}</div>
              )}
              <div className="af-time muted">{timeAgo(result.recorded_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Leaderboard({ ownerScores, ownerId, onSelectOwner, wrestlers, picks, owners }) {
  return (
    <div className="leaderboard">
      <p className="lb-hint muted">Tap a row to view that team's roster</p>
      <div className="lb-table">
        <div className="lb-header">
          <div>Rank</div>
          <div>Owner</div>
          <div>Picks</div>
          <div>Points</div>
          <div></div>
        </div>
        {ownerScores.map((owner, idx) => {
          const champCount = owner.picks.filter(p => {
            const w = wrestlers.find(w => w.id === p.wrestler_id)
            return (w?.round_results || []).some(r => r.round === '1st' && !r.is_loss)
          }).length

          return (
            <div
              key={owner.id}
              className={`lb-row clickable ${owner.id === ownerId ? 'me' : ''} ${champCount > 0 ? 'lb-has-champ' : ''}`}
              onClick={() => onSelectOwner(owner)}
            >
              <div className="lb-rank">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
              </div>
              <div className="lb-name">
                {owner.name}
                {owner.id === ownerId && <span className="you-badge"> (You)</span>}
                {champCount > 0 && <span className="lb-champ-badge">🏆×{champCount}</span>}
              </div>
              <div className="lb-picks">{owner.picks.length}/10</div>
              <div className="lb-points">{owner.totalPoints.toFixed(1)}</div>
              <div className="lb-arrow">›</div>
            </div>
          )
        })}
      </div>
      <ActivityFeed wrestlers={wrestlers} picks={picks} owners={owners} />
    </div>
  )
}

function ByWeight({ picks, wrestlers, owners }) {
  return (
    <div className="by-weight">
      {WEIGHT_CLASSES.map(wc => {
        const weightPicks = picks.filter(p => p.weight_class === wc)
        if (weightPicks.length === 0) return null

        const rows = weightPicks
          .map(p => {
            const wrestler = wrestlers.find(w => w.id === p.wrestler_id)
            const owner = owners.find(o => o.id === p.owner?.id)
            return { pick: p, wrestler, owner, points: wrestler?.total_points || 0 }
          })
          .sort((a, b) => b.points - a.points)

        return (
          <div key={wc} className="weight-section card">
            <h3>{wc} lbs</h3>
            <div className="weight-picks">
              {rows.map(({ pick, wrestler, owner, points }) => (
                <div
                  key={pick.id}
                  className={`weight-pick-row ${wrestler?.is_eliminated ? 'eliminated' : ''}`}
                >
                  <span className="wp-seed">#{wrestler?.seed}</span>
                  <span className="wp-name">{wrestler?.name}</span>
                  <span className="wp-school">{wrestler?.school}</span>
                  <span className="wp-owner">{owner?.name}</span>
                  <span className="wp-pts">{points.toFixed(1)} pts</span>
                  {wrestler?.is_eliminated && <span className="wp-elim">OUT</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const ROUND_LABELS = {
  R64: 'Round 1', R32: 'Round 2', R16: 'Quarters', SF: 'Semis',
  '1st': 'Finals', '3rd': '3rd Place',
  C1: 'Consolation 1', C2: 'Consolation 2', C3: 'Consolation 3',
  C4: 'Consolation 4', C5: 'All-American',
}
const WIN_TYPE_LABELS = {
  fall: 'Fall', tech_fall: 'Tech Fall', major: 'Major Dec.',
  decision: 'Decision', bye: 'Bye', forfeit: 'Forfeit',
}

function WrestlerDetail({ wrestler, onBack }) {
  const results = (wrestler.round_results || [])
    .slice()
    .sort((a, b) => {
      const order = ['R64','R32','R16','SF','1st','3rd','C1','C2','C3','C4','C5']
      return order.indexOf(a.round) - order.indexOf(b.round)
    })

  return (
    <div className="wrestler-detail">
      <button className="back-btn" onClick={onBack}>← Back to Roster</button>

      <div className="wd-header card">
        <div className="wd-meta">
          <div className="wd-weight">{wrestler.weight_class} lbs · Seed #{wrestler.seed}</div>
          <h2 className="wd-name">{wrestler.name}</h2>
          <div className="wd-school muted">{wrestler.school}</div>
        </div>
        <div className="wd-right">
          <div className="wd-pts">{(wrestler.total_points || 0).toFixed(1)}</div>
          <div className="wd-pts-label muted">pts</div>
          {wrestler.is_eliminated
            ? <span className="elim-tag">Eliminated</span>
            : <span className="active-tag">Active</span>}
        </div>
      </div>

      {results.length === 0 ? (
        <p className="muted" style={{ padding: '16px 0' }}>No results recorded yet.</p>
      ) : (
        <div className="wd-results">
          {results.map((r, i) => (
            <div key={i} className={`wd-result-row card ${r.is_loss ? 'wd-loss' : 'wd-win'}`}>
              <div className="wd-round">{ROUND_LABELS[r.round] || r.round}</div>
              <div className="wd-result-badge">{r.is_loss ? 'L' : 'W'}</div>
              <div className="wd-detail">
                {!r.is_loss && <span className="wd-type">{WIN_TYPE_LABELS[r.result_type] || r.result_type}</span>}
                {r.opponent && <span className="wd-opp muted">vs. {r.opponent}</span>}
              </div>
              {!r.is_loss && (
                <div className="wd-earned">+{r.points % 1 ? r.points.toFixed(1) : r.points} pts</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamRoster({ owner, wrestlers, rank, isMe, onBack }) {
  const [selectedWrestler, setSelectedWrestler] = useState(null)

  const totalPoints = owner.picks.reduce((sum, p) => {
    const wrestler = wrestlers.find(w => w.id === p.wrestler_id)
    return sum + (wrestler?.total_points || 0)
  }, 0)

  if (selectedWrestler) {
    return (
      <WrestlerDetail
        wrestler={selectedWrestler}
        onBack={() => setSelectedWrestler(null)}
      />
    )
  }

  const rankLabel = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
  const activeCount = owner.picks.filter(p => {
    const w = wrestlers.find(w => w.id === p.wrestler_id)
    return w && !w.is_eliminated
  }).length

  return (
    <div className="my-team-page">
      <button className="back-btn" onClick={onBack}>← Leaderboard</button>

      <div className="team-header card">
        <div className="team-header-top">
          <div className="team-rank-badge">{rankLabel}</div>
          <div>
            <h2>{owner.name}{isMe && <span className="you-badge"> (You)</span>}</h2>
            <div className="team-meta muted">{activeCount} active · {owner.picks.length - activeCount} eliminated</div>
          </div>
        </div>
        <div className="team-total">{totalPoints.toFixed(1)} pts</div>
      </div>

      <div className="team-roster">
        {WEIGHT_CLASSES.map(wc => {
          const pick = owner.picks.find(p => p.weight_class === wc)
          const wrestler = pick ? wrestlers.find(w => w.id === pick.wrestler_id) : null
          const pts = wrestler?.total_points || 0

          const isChamp = (wrestler?.round_results || []).some(r => r.round === '1st' && !r.is_loss)

          return (
            <div
              key={wc}
              className={`team-card card ${wrestler?.is_eliminated ? 'eliminated' : ''} ${wrestler ? 'clickable' : ''} ${isChamp ? 'champ-card' : ''}`}
              onClick={() => wrestler && setSelectedWrestler(wrestler)}
            >
              <div className="team-weight">{wc} lbs</div>
              {wrestler ? (
                <>
                  {isChamp && <div className="champ-banner">🏆 Champion</div>}
                  <div className="team-wrestler-name">{wrestler.name}</div>
                  <div className="team-school">{wrestler.school} · Seed #{wrestler.seed}</div>
                  <div className="team-pts-row">
                    <span className={`team-pts ${pts > 0 ? 'scoring' : ''}`}>{pts.toFixed(1)} pts</span>
                    {wrestler.is_eliminated && !isChamp && <span className="elim-tag">OUT</span>}
                    {!wrestler.is_eliminated && !isChamp && <span className="active-tag">Active</span>}
                  </div>
                  {(wrestler.round_results || []).length > 0 && (
                    <div className="team-card-hint muted">Tap for results →</div>
                  )}
                </>
              ) : (
                <div className="no-pick muted">No pick</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
