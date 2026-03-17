import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDraftSession } from '../hooks/useDraftSession'

export default function Lobby() {
  const navigate = useNavigate()
  const { session, loading: sessionLoading } = useDraftSession()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!session) return
    const hasAuth = !!localStorage.getItem('owner_id')
    if (!hasAuth) return
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
    const enteredName = name.trim().toLowerCase()

    if (!enteredName) {
      setError('Please enter your name.')
      setJoining(false)
      return
    }

    const { data, error: err } = await supabase
      .from('owners')
      .select('id, name, join_code')
      .eq('join_code', code)
      .single()

    if (err || !data) {
      setError('Code not found. Check your code and try again.')
      setJoining(false)
      return
    }

    if (data.name.toLowerCase() !== enteredName) {
      setError("Name doesn't match that code. Try again.")
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
        <img src="/logo.png" alt="Wrestle Org" className="lobby-logo" />
        <h1>NCAA Wrestling Fantasy</h1>
        <p className="subtitle">2026 NCAA Championships</p>
      </div>

      <div className="lobby-grid" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="card">
          <h2>Sign In</h2>
          <form onSubmit={handleJoin} className="form">
            <label>Your name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Jesse"
              autoFocus
            />
            <label>Join code</label>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="code-input"
            />
            <button type="submit" className="btn btn-primary" disabled={joining}>
              {joining ? 'Checking...' : 'Enter'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
