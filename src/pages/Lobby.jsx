import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useOwners } from '../hooks/useOwners'
import { useDraftSession } from '../hooks/useDraftSession'

const TOTAL_OWNERS = 10

export default function Lobby() {
  const navigate = useNavigate()
  const { owners, loading: ownersLoading } = useOwners()
  const { session, loading: sessionLoading } = useDraftSession()
  const [joinCode, setJoinCode] = useState('')
  const [newOwnerName, setNewOwnerName] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!session) return
    const hasAuth = !!localStorage.getItem('owner_id')
    if (!hasAuth) return  // no code entered yet — stay on lobby
    if (session.status === 'complete') {
      navigate('/scores')
    } else if (session.status === 'active') {
      navigate('/draft')
    }
  }, [session, navigate])

  async function handleJoin(e) {
    e.preventDefault()
    setError('')
    setJoining(true)

    const code = joinCode.trim().toUpperCase()
    const { data, error: err } = await supabase
      .from('owners')
      .select('id, name, join_code')
      .eq('join_code', code)
      .single()

    if (err || !data) {
      setError('Code not found. Ask your commissioner for your join code.')
      setJoining(false)
      return
    }

    localStorage.setItem('owner_id', data.id)
    localStorage.setItem('owner_name', data.name)
    localStorage.setItem('join_code', code)
    if (session?.status === 'complete') {
      navigate('/scores')
    } else {
      navigate('/draft')
    }
    setJoining(false)
  }

  async function handleCreateOwner(e) {
    e.preventDefault()
    setError('')
    setCreating(true)

    const name = newOwnerName.trim()
    if (!name) { setError('Name required.'); setCreating(false); return }
    if (owners.length >= TOTAL_OWNERS) { setError('Draft is full (10/10 owners).'); setCreating(false); return }

    // Generate a random 6-char alphanumeric code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()

    const { data, error: err } = await supabase
      .from('owners')
      .insert({ name, join_code: code })
      .select()
      .single()

    if (err) {
      setError('Failed to create owner: ' + err.message)
      setCreating(false)
      return
    }

    localStorage.setItem('owner_id', data.id)
    localStorage.setItem('owner_name', data.name)
    localStorage.setItem('join_code', data.join_code)
    navigate('/draft')
    setCreating(false)
  }

  async function handleStartDraft() {
    if (owners.length < 2) { setError('Need at least 2 owners to start.'); return }

    // Assign draft order randomly
    const shuffled = [...owners].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await supabase
        .from('owners')
        .update({ draft_order: i + 1 })
        .eq('id', shuffled[i].id)
    }

    await supabase
      .from('draft_session')
      .update({ status: 'active', current_pick: 1, started_at: new Date().toISOString() })
      .eq('id', 1)
  }

  const storedOwnerId = localStorage.getItem('owner_id')
  const currentOwner = owners.find(o => o.id === storedOwnerId)
  const isCommissioner = currentOwner?.is_commissioner

  // Don't render anything until session is known — avoids flashing the join form
  // before the redirect to /scores fires
  if (sessionLoading) {
    return (
      <div className="lobby-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p className="muted">Loading...</p>
      </div>
    )
  }

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <div className="logo">🤼</div>
        <h1>NCAA Wrestling Fantasy Draft</h1>
        <p className="subtitle">2026 NCAA Championships</p>
      </div>

      <div className="lobby-grid">
        {/* Roster */}
        <div className="card">
          <h2>Owners ({owners.length}/{TOTAL_OWNERS})</h2>
          {ownersLoading ? (
            <p className="muted">Loading...</p>
          ) : owners.length === 0 ? (
            <p className="muted">No owners yet. Be the first to join!</p>
          ) : (
            <ul className="owner-list">
              {owners.map(o => (
                <li key={o.id} className={o.id === storedOwnerId ? 'me' : ''}>
                  <span className="owner-name">{o.name}</span>
                  {o.is_commissioner && <span className="badge comm">Commissioner</span>}
                  {o.draft_order && <span className="badge order">#{o.draft_order}</span>}
                  {o.id === storedOwnerId && <span className="badge me-badge">You</span>}
                </li>
              ))}
            </ul>
          )}

          {session?.status === 'pending' && isCommissioner && owners.length >= 2 && (
            <button className="btn btn-primary start-btn" onClick={handleStartDraft}>
              Start Draft ({owners.length} owners)
            </button>
          )}
          {session?.status === 'pending' && !isCommissioner && (
            <p className="muted waiting">Waiting for commissioner to start the draft...</p>
          )}
        </div>

        {/* Join / Create */}
        <div className="card">
          {!storedOwnerId ? (
            <>
              <h2>Join</h2>
              <form onSubmit={handleJoin} className="form">
                <label>Enter your join code</label>
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  className="code-input"
                />
                <button type="submit" className="btn" disabled={joining}>
                  {joining ? 'Joining...' : 'Join Draft'}
                </button>
              </form>

              <div className="divider">or</div>

              <h2>Create Spot</h2>
              <form onSubmit={handleCreateOwner} className="form">
                <label>Your name</label>
                <input
                  value={newOwnerName}
                  onChange={e => setNewOwnerName(e.target.value)}
                  placeholder="Your name"
                />
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Join as New Owner'}
                </button>
                <p className="hint">First owner created becomes commissioner.</p>
              </form>
            </>
          ) : (
            <div className="joined-card">
              <div className="check">✓</div>
              <h2>You're in, {localStorage.getItem('owner_name')}!</h2>
              <p>Your join code: <strong>{localStorage.getItem('join_code')}</strong></p>
              <p className="muted">Share your code with others if needed.<br/>Waiting for draft to start.</p>
              <button className="btn" onClick={() => navigate('/draft')}>Go to Draft Room</button>
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
