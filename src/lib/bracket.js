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

// Returns the loser of a match. Returns null for byes or undecided matches.
export function getMatchLoser(match) {
  const { topBye, bottomBye } = match
  if (topBye || bottomBye) return null
  const winner = getMatchWinner(match)
  if (winner === null) return null
  return winner === match.top ? match.bottom : match.top
}

// Internal: winner of a consolation match.
// If one slot is null (missing seed / bye), auto-advance the other.
function getConsMatchWinner({ top, bottom, rk }) {
  if (!top && !bottom) return null
  if (!top)    return bottom   // bye / missing opponent → auto-advance
  if (!bottom) return top      // bye / missing opponent → auto-advance
  const r1 = getRound(top, rk)
  const r2 = getRound(bottom, rk)
  if (r1 && !r1.is_loss) return top
  if (r2 && !r2.is_loss) return bottom
  if (r1?.is_loss)        return bottom
  if (r2?.is_loss)        return top
  return null
}

// Builds all 5 consolation rounds with full TBD propagation.
// Returns [c1, c2, c3, c4, c5] — each is an array of match objects.
export function buildConsRounds(wrestlers) {
  const champRounds = buildRounds(wrestlers)
  const r64 = champRounds[0]   // 16 R64 matches
  const r32 = champRounds[1]   // 8 R32 matches
  const sf  = champRounds[3]   // 2 SF matches

  // C1: losers of adjacent R64 pairs → 8 matches
  const c1 = []
  for (let m = 0; m < 8; m++) {
    c1.push({
      top:    getMatchLoser(r64[2 * m]),
      bottom: getMatchLoser(r64[2 * m + 1]),
      rk: 'C1',
    })
  }

  // C2: top-half C1 winners [0-3] × bottom-half R32 losers [4-7]
  //     bottom-half C1 winners [4-7] × top-half R32 losers [0-3]
  const c2 = []
  for (let m = 0; m < 4; m++) {
    c2.push({ top: getConsMatchWinner(c1[m]),     bottom: getMatchLoser(r32[4 + m]), rk: 'C2' })
  }
  for (let m = 0; m < 4; m++) {
    c2.push({ top: getConsMatchWinner(c1[4 + m]), bottom: getMatchLoser(r32[m]),     rk: 'C2' })
  }

  // C3: C2 winners, adjacent pairs → 4 matches
  const c3 = []
  for (let m = 0; m < 4; m++) {
    c3.push({
      top:    getConsMatchWinner(c2[2 * m]),
      bottom: getConsMatchWinner(c2[2 * m + 1]),
      rk: 'C3',
    })
  }

  // C4: C3 winners, adjacent pairs → 2 matches
  const c4 = []
  for (let m = 0; m < 2; m++) {
    c4.push({
      top:    getConsMatchWinner(c3[2 * m]),
      bottom: getConsMatchWinner(c3[2 * m + 1]),
      rk: 'C4',
    })
  }

  // C5: C4 winners × SF losers → 2 matches (straight connectors from C4)
  const c5 = [
    { top: getConsMatchWinner(c4[0]), bottom: getMatchLoser(sf[0]), rk: 'C5' },
    { top: getConsMatchWinner(c4[1]), bottom: getMatchLoser(sf[1]), rk: 'C5' },
  ]

  return [c1, c2, c3, c4, c5]
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
