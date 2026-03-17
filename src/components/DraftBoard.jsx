import { WEIGHT_CLASSES } from '../lib/scoring'

export default function DraftBoard({ picks, owners }) {
  const sortedOwners = [...owners]
    .filter(o => o.draft_order)
    .sort((a, b) => a.draft_order - b.draft_order)

  // Build lookup: ownerID + weightClass -> pick
  const pickMap = {}
  picks.forEach(p => {
    const key = `${p.owner?.id}-${p.weight_class}`
    pickMap[key] = p
  })

  return (
    <div className="draft-board-wrapper">
      <div className="draft-board">
        {/* Header row */}
        <div className="board-row header-row">
          <div className="board-cell weight-header">Weight</div>
          {sortedOwners.map(o => (
            <div key={o.id} className="board-cell owner-header">
              <span className="owner-abbr">{o.name.split(' ')[0]}</span>
              <span className="owner-order">#{o.draft_order}</span>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {WEIGHT_CLASSES.map(wc => (
          <div key={wc} className="board-row">
            <div className="board-cell weight-cell">{wc}</div>
            {sortedOwners.map(o => {
              const pick = pickMap[`${o.id}-${wc}`]
              return (
                <div
                  key={o.id}
                  className={`board-cell wrestler-cell ${pick ? 'filled' : 'empty'} ${pick?.wrestler?.is_eliminated ? 'eliminated' : ''}`}
                >
                  {pick ? (
                    <>
                      <span className="bc-name">{pick.wrestler?.name?.split(' ').slice(-1)[0]}</span>
                      <span className="bc-seed">#{pick.wrestler?.seed}</span>
                      {pick.wrestler?.total_points > 0 && (
                        <span className="bc-pts">{pick.wrestler?.total_points}pt</span>
                      )}
                    </>
                  ) : (
                    <span className="bc-empty">—</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
