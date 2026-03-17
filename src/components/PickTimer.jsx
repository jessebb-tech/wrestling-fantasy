import { useState, useEffect, useRef } from 'react'

export default function PickTimer({ seconds, currentPick, isMyTurn }) {
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef(null)

  // Reset timer when pick changes
  useEffect(() => {
    setRemaining(seconds)
  }, [currentPick, seconds])

  useEffect(() => {
    if (remaining <= 0) return

    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(intervalRef.current)
          return 0
        }
        return r - 1
      })
    }, 1000)

    return () => clearInterval(intervalRef.current)
  }, [currentPick]) // restart on new pick

  const pct = (remaining / seconds) * 100
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#f59e0b' : '#ef4444'

  return (
    <div className={`pick-timer ${isMyTurn ? 'my-timer' : ''}`}>
      <div className="timer-bar-bg">
        <div
          className="timer-bar-fill"
          style={{ width: `${pct}%`, background: color, transition: 'width 1s linear, background 0.3s' }}
        />
      </div>
      <span className="timer-count" style={{ color }}>
        {remaining}s
      </span>
    </div>
  )
}
