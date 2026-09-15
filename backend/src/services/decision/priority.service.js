// Combines importance + urgency into one deterministic, explainable
// priority score and level. The LLM has no involvement in this step.

const IMPORTANCE_WEIGHT = 0.6;
const URGENCY_WEIGHT = 0.4;

function levelForScore(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

/**
 * @param {object} params
 * @param {{ score: number, reasons: string[] }} params.importance
 * @param {{ score: number, reasons: string[] }} params.urgency
 * @returns {{ score: number, level: string, reasons: string[] }}
 */
function computePriority({ importance, urgency }) {
  const rawScore = importance.score * IMPORTANCE_WEIGHT + urgency.score * URGENCY_WEIGHT;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const level = levelForScore(score);

  const reasons = [
    `priority = importance(${importance.score}) * ${IMPORTANCE_WEIGHT} + urgency(${urgency.score}) * ${URGENCY_WEIGHT} = ${score}`,
    ...importance.reasons.map((r) => `[Importance] ${r}`),
    ...urgency.reasons.map((r) => `[Urgency] ${r}`),
  ];

  return { score, level, reasons };
}

module.exports = { computePriority, IMPORTANCE_WEIGHT, URGENCY_WEIGHT };
