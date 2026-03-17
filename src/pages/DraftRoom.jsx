import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDraftSession } from '../hooks/useDraftSession'
import { usePicks } from '../hooks/usePicks'
import { useOwners } from '../hooks/useOwners'
import { useWrestlers } from '../hooks/useWrestlers'
import { snakeDraftOwner, WEIGHT_CLASSES } from '../lib/scoring'
import WrestlerCard from '../components/WrestlerCard'
import DraftBoard from '../components/DraftBoard'
import PickTimer from '../components/PickTimer'

export default function DraftRoom() {
  const navigate = useNavigate()
  const { session, loading: sessionLoading } = useDraftSession()
  const { picks, loading: picksLoading } = usePicks()
  const { owners } = useOwners()
  const { wrestlers } = useWrestlers()

  const [selectedWeight, setSelectedWeight] = useState(WEIGHT_CLASSES[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [makingPick, setMakingPick] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('draft') // 'draft' | 'board'

  const ownerId = localStorage.getItem('owner_id')
  const ownerName = localStorage.getItem('owner_name')

  // Redirect if no identity
  useEffect(() => {
    if (!ownerId) navigate('/')
  }, [ownerId, navigate])

  useEffect(() => {
    if (session?.status === 'complete') navigate('/scores')
  }, [session, navigate])

  if (sessionLoading || picksLoading) {
    return <div className="loading-screen">Loading draft...</div>
  }

  if (session?.status === 'pending') {
    return (
      <div className="waiting-screen">
        <div className="logo">🤼</div>
        <h2>Waiting for the commissioner to start the draft...</h2>
        <button className="btn" onClick={() => navigate('/')}>← Back to Lobby</button>
      </div>
    )
  }

  const currentPick = session?.current_pick || 1
  const totalOwners = owners.length
  const currentDraftOrder = snakeDraftOwner(currentPick, totalOwners)
  const currentPickOwner = owners.find(o => o.draft_order === currentDraftOrder)
  const myOwner = owners.find(o => o.id === ownerId)
  const isMyTurn = currentPickOwner?.id === ownerId

  // Current weight class being drafted (based on which round we're in)
  const currentRound = Math.ceil(currentPick / totalOwners) // 1-10
  const currentWeightClass = WEIGHT_CLASSES[currentRound - 1]

  // Which wrestlers are already picked
  const pickedWrestlerIds = new Set(picks.map(p => p.wrestler_id))

  // Filter wrestlers for the picker
  const availableWrestlers = wrestlers.filter(w => {
    const matchesWeight = w.weight_class === selectedWeight
    const notPicked = !pickedWrestlerIds.has(w.id)
    const matchesSearch = !searchQuery ||
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.school || '').toLowerCase().includes(searchQuery.toLowerCase())
    return matchesWeight && notPicked && matchesSearch
  })

  // My picks so far
  const myPicks = picks.filter(p => p.owner?.id === ownerId)

  async function makePick(wrestler) {
    if (!isMyTurn) return
    if (pickedWrestlerIds.has(wrestler.id)) { setError('Already picked.'); return }

    setMakingPick(true)
    setError('')

    // Check current weight class matches
    if (wrestler.weight_class !== currentWeightClass) {
      setError(`This round is for ${currentWeightClass} lbs. Please pick a ${currentWeightClass} lb wrestler.`)
      setMakingPick(false)
      return
    }

    const { error: pickErr } = await supabase
      .from('picks')
      .insert({
        pick_number: currentPick,
        owner_id: ownerId,
        wrestler_id: wrestler.id,
        weight_class: wrestler.weight_class
      })

    if (pickErr) {
      setError('Pick failed: ' + pickErr.message)
      setMakingPick(false)
      return
    }

    // Advance the draft
    const nextPick = currentPick + 1
    const isDraftComplete = nextPick > totalOwners * WEIGHT_CLASSES.length

    await supabase
      .from('draft_session')
      .update({
        current_pick: nextPick,
        status: isDraftComplete ? 'complete' : 'active',
        ...(isDraftComplete ? { completed_at: new Date().toISOString() } : {})
      })
      .eq('id', 1)

    setMakingPick(false)
  }

  return (
    <div className="draft-room">
      {/* Header */}
      <header className="draft-header">
        <div className="draft-header-left">
          <span className="logo-sm">🤼</span>
          <h1>Draft Room</h1>
        </div>
        <div className="draft-header-center">
          <div className="current-pick-banner">
            <span className="pick-num">Pick #{currentPick}</span>
            <span className="pick-sep">·</span>
            <span className="weight-class">{currentWeightClass} lbs</span>
            <span className="pick-sep">·</span>
            <span className={`on-clock ${isMyTurn ? 'my-turn' : ''}`}>
              {isMyTurn ? '⏰ YOUR TURN' : `On the clock: ${currentPickOwner?.name || '...'}`}
            </span>
          </div>
        </div>
        <div className="draft-header-right">
          <button className={`tab-btn ${view === 'draft' ? 'active' : ''}`} onClick={() => setView('draft')}>
            Pick
          </button>
          <button className={`tab-btn ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>
            Board
          </button>
          <button className="btn-sm" onClick={() => navigate('/scores')}>Scores</button>
        </div>
      </header>

      {/* Timer */}
      {session?.pick_timer_secs > 0 && (
        <PickTimer
          seconds={session.pick_timer_secs}
          currentPick={currentPick}
          isMyTurn={isMyTurn}
        />
      )}

      {error && <div className="error-bar">{error} <button onClick={() => setError('')}>✕</button></div>}

      {view === 'board' ? (
        <DraftBoard picks={picks} owners={owners} />
      ) : (
        <div className="draft-layout">
          {/* Left: Wrestler Picker */}
          <div className="wrestler-picker">
            <div className="picker-header">
              <h2>Available Wrestlers</h2>
              <div className="weight-tabs">
                {WEIGHT_CLASSES.map(wc => {
                  const picked = picks.filter(p => p.weight_class === wc).length
                  const total = wrestlers.filter(w => w.weight_class === wc).length
                  return (
                    <button
                      key={wc}
                      className={`weight-tab ${selectedWeight === wc ? 'active' : ''} ${wc === currentWeightClass ? 'current-round' : ''}`}
                      onClick={() => setSelectedWeight(wc)}
                    >
                      {wc}
                      {picked > 0 && <span className="pick-count">{total - picked}</span>}
                    </button>
                  )
                })}
              </div>
              <input
                className="search-input"
                placeholder="Search wrestler or school..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="wrestler-grid">
              {availableWrestlers.length === 0 ? (
                <p className="muted center">No wrestlers available at {selectedWeight} lbs</p>
              ) : (
                availableWrestlers.map(wrestler => (
                  <WrestlerCard
                    key={wrestler.id}
                    wrestler={wrestler}
                    isMyTurn={isMyTurn && wrestler.weight_class === currentWeightClass}
                    isPicked={pickedWrestlerIds.has(wrestler.id)}
                    onPick={() => makePick(wrestler)}
                    disabled={makingPick || !isMyTurn || wrestler.weight_class !== currentWeightClass}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: My Team + Pick Order */}
          <div className="draft-sidebar">
            <div className="my-team card">
              <h3>{ownerName}'s Team</h3>
              {myPicks.length === 0 ? (
                <p className="muted">No picks yet</p>
              ) : (
                <ul className="my-picks-list">
                  {myPicks.map(p => (
                    <li key={p.id}>
                      <span className="pick-weight">{p.weight_class}</span>
                      <span className="pick-wrestler">{p.wrestler?.name}</span>
                      <span className="pick-school">{p.wrestler?.school}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="pick-order card">
              <h3>Pick Order</h3>
              <div className="order-list">
                {owners
                  .filter(o => o.draft_order)
                  .sort((a, b) => a.draft_order - b.draft_order)
                  .map(o => (
                    <div
                      key={o.id}
                      className={`order-item ${o.id === currentPickOwner?.id ? 'on-clock' : ''} ${o.id === ownerId ? 'me' : ''}`}
                    >
                      <span className="order-num">#{o.draft_order}</span>
                      <span className="order-name">{o.name}</span>
                      <span className="order-picks">
                        {picks.filter(p => p.owner?.id === o.id).length}/{WEIGHT_CLASSES.length}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
