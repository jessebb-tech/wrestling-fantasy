/**
 * Shared bracket logic — used by BracketView and matchup detection
 */

export const R64_SEED_PAIRS = [
  [1,32],[16,17],[8,25],[9,24],[5,28],[12,21],[4,29],[13,20],
  [3,30],[14,19],[6,27],[11,22],[7,26],[10,23],[2,31],[15,18],
]

export const ROUND_KEYS = ['R64', 'R32', 'R16', 'SF', '1st']

export function getRound(w, rk) {
  if (!w) return null
  return (w.round_results || []).find(r => r.round === rk) || null
}

// Returns winner of a match object.
// Only R64 matches can have true byes (topBye/bottomBye).
// In R32+, null slot = TBD — never auto-advance.
export function getMatchWinner(match) {
  const { top, bottom, topBye, bottomBye, rk } = match
  if (!top && !bottom) return null
  if (topBye)    return bottom
  if (bottomBye) return top
  if (!top || !bottom) return null
  const r1 = getRound(top,    rk)
  const r2 = getRound(bottom, rk)
  if (r1 && !r1.is_loss) return top
  if (r2 && !r2.is_loss) return bottom
  if (r1?.is_loss)        return bottom
  if (r2?.is_loss)        return top
  return null
}

export function buildRounds(wrestlers) {
  const bySeed = {}
  wrestlers.forEach(w => { if (w.seed) bySeed[w.seed] = w })

  const rounds = []
  const r0 = R64_SEED_PAIRS.map(([s1, s2]) => ({
    top:       bySeed[s1] || null,
    topBye:    !bySeed[s1],
    bottom:    bySeed[s2] || null,
    bottomBye: !bySeed[s2],
    rk: 'R64',
  }))
  rounds.push(r0)

  for (let r = 1; r < 5; r++) {
    const prev = rounds[r - 1]
    const curr = []
    for (let m = 0; m < prev.length / 2; m++) {
      const a = prev[2 * m]
      const b = prev[2 * m + 1]
      curr.push({
        top:       getMatchWinner(a),
        topBye:    false,
        bottom:    getMatchWinner(b),
        bottomBye: false,
        rk: ROUND_KEYS[r],
      })
    }
    rounds.push(curr)
  }
  return rounds
}

// Returns all upcoming matchups where both wrestlers are determined
// but the match hasn't been played yet.
// ownerMap: { wrestler_id → owner_name }
export function getUpcomingMatchups(wrestlers, ownerMap, weightClass) {
  const rounds = buildRounds(wrestlers)
  const matchups = []

  for (const matches of rounds) {
    for (const match of matches) {
      const { top, bottom, rk } = match
      if (!top || !bottom) continue              // one side TBD
      if (getMatchWinner(match) !== null) continue // already decided

      const ownerTop    = ownerMap[top.id]
      const ownerBottom = ownerMap[bottom.id]

      matchups.push({
        weightClass,
        round: rk,
        top,    ownerTop,
        bottom, ownerBottom,
        isH2H: ownerTop && ownerBottom && ownerTop !== ownerBottom,
      })
    }
  }

  return matchups
}
