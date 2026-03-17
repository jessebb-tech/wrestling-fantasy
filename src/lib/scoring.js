/**
 * NCAA Wrestling Tournament Scoring
 * Official point values per the NCAA scoring system
 */

export const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285]

// Points for advancing to each round
export const ADVANCEMENT_POINTS = {
  R64:  1.0,  // First round win (Championship bracket)
  R32:  1.0,  // Second round
  R16:  1.0,  // Third round (quarterfinals)
  SF:   1.5,  // Semifinals
  '3rd': 1.5, // Third place match win
  '1st': 3.0, // Championship win
  // Consolation bracket
  C1:   0.5,  // First consolation round
  C2:   0.5,  // Second consolation round
  C3:   0.5,  // Third consolation round
  C4:   0.5,  // Fourth consolation round
  C5:   0.5,  // Fifth consolation round (All-American)
}

// Bonus points for type of win (added ON TOP of advancement points)
export const WIN_BONUS = {
  fall:       2.0,  // Pin
  tech_fall:  1.5,  // Technical fall (15+ point lead)
  major:      1.0,  // Major decision (8-14 point lead)
  decision:   0.0,  // Regular decision
  bye:        0.0,  // Bye
  forfeit:    0.0,  // Opponent forfeits
  medical_ff: 0.0,  // Medical forfeit
}

/**
 * Calculate total fantasy points from an array of scoring events
 * @param {Array} events - array of { round, result_type, points } objects
 */
export function calculateTotal(events) {
  return events.reduce((sum, e) => sum + (e.points || 0), 0)
}

/**
 * Get points for a specific result
 * @param {string} round - e.g. "R32", "SF", "1st"
 * @param {string} resultType - e.g. "fall", "decision"
 */
export function getPoints(round, resultType) {
  const adv = ADVANCEMENT_POINTS[round] ?? 0
  const bonus = WIN_BONUS[resultType] ?? 0
  return adv + bonus
}

/**
 * Determine draft order (snake) — returns owner draft_order for pick N
 * @param {number} pickNum - 1-indexed pick number
 * @param {number} totalOwners - default 10
 */
export function snakeDraftOwner(pickNum, totalOwners = 10) {
  const round = Math.floor((pickNum - 1) / totalOwners)
  const position = (pickNum - 1) % totalOwners
  if (round % 2 === 0) {
    return position + 1  // forward
  } else {
    return totalOwners - position  // reverse
  }
}

/**
 * Get all pick numbers for a given owner in snake draft
 * @param {number} draftOrder - 1-indexed owner position
 * @param {number} totalOwners
 * @param {number} totalRounds - = number of weight classes = 10
 */
export function getOwnerPicks(draftOrder, totalOwners = 10, totalRounds = 10) {
  const picks = []
  for (let pick = 1; pick <= totalOwners * totalRounds; pick++) {
    if (snakeDraftOwner(pick, totalOwners) === draftOrder) {
      picks.push(pick)
    }
  }
  return picks
}
