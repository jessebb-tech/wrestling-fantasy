import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOwners } from '../hooks/useOwners'
import { usePicks } from '../hooks/usePicks'
import { useWrestlers } from '../hooks/useWrestlers'
import { WEIGHT_CLASSES } from '../lib/scoring'

export default function Scores() {
  const navigate = useNavigate()
  const { owners } = useOwners()
  const { picks } = usePicks()
  const { wrestlers } = useWrestlers()
  const [view, setView] = useState('leaderboard') // 'leaderboard' | 'by_weight' | 'team'
  const [selectedOwner, setSelectedOwner] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const ownerId = localStorage.getItem('owner_id')

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
          <span className="logo-sm">🤼</span>
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
        />
      )}
      {view === 'by_weight' && <ByWeight picks={picks} wrestlers={wrestlers} owners={owners} />}
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

function Leaderboard({ ownerScores, ownerId, onSelectOwner }) {
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
        {ownerScores.map((owner, idx) => (
          <div
            key={owner.id}
            className={`lb-row clickable ${owner.id === ownerId ? 'me' : ''}`}
            onClick={() => onSelectOwner(owner)}
          >
            <div className="lb-rank">
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
            </div>
            <div className="lb-name">{owner.name}{owner.id === ownerId && <span className="you-badge"> (You)</span>}</div>
            <div className="lb-picks">{owner.picks.length}/10</div>
            <div className="lb-points">{owner.totalPoints.toFixed(1)}</div>
            <div className="lb-arrow">›</div>
          </div>
        ))}
      </div>
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

function TeamRoster({ owner, wrestlers, rank, isMe, onBack }) {
  const totalPoints = owner.picks.reduce((sum, p) => {
    const wrestler = wrestlers.find(w => w.id === p.wrestler_id)
    return sum + (wrestler?.total_points || 0)
  }, 0)

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

          return (
            <div key={wc} className={`team-card card ${wrestler?.is_eliminated ? 'eliminated' : ''}`}>
              <div className="team-weight">{wc} lbs</div>
              {wrestler ? (
                <>
                  <div className="team-wrestler-name">{wrestler.name}</div>
                  <div className="team-school">{wrestler.school} · Seed #{wrestler.seed}</div>
                  <div className="team-pts-row">
                    <span className={`team-pts ${pts > 0 ? 'scoring' : ''}`}>{pts.toFixed(1)} pts</span>
                    {wrestler.is_eliminated && <span className="elim-tag">OUT</span>}
                    {!wrestler.is_eliminated && <span className="active-tag">Active</span>}
                  </div>
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
