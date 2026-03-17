export default function WrestlerCard({ wrestler, isMyTurn, isPicked, onPick, disabled }) {
  const seedBadgeClass =
    wrestler.seed <= 4 ? 'seed-top' :
    wrestler.seed <= 8 ? 'seed-high' :
    'seed-low'

  return (
    <div
      className={`wrestler-card ${isPicked ? 'picked' : ''} ${isMyTurn ? 'pickable' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={!disabled && !isPicked ? onPick : undefined}
      role={!disabled && !isPicked ? 'button' : undefined}
      tabIndex={!disabled && !isPicked ? 0 : undefined}
      onKeyDown={e => { if (e.key === 'Enter' && !disabled && !isPicked) onPick() }}
    >
      <div className="wrestler-card-inner">
        <div className="wrestler-seed-badge">
          <span className={`seed ${seedBadgeClass}`}>#{wrestler.seed || '?'}</span>
        </div>
        <div className="wrestler-info">
          <div className="wrestler-name">{wrestler.name}</div>
          <div className="wrestler-school">{wrestler.school || '—'}</div>
        </div>
        {wrestler.total_points > 0 && (
          <div className="wrestler-pts">{wrestler.total_points} pts</div>
        )}
        {isMyTurn && !isPicked && (
          <div className="pick-cta">Pick</div>
        )}
      </div>
    </div>
  )
}
