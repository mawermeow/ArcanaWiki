import type { GraphRelationType } from "./types.ts";

const GRAPH_RELATION_BASE_SCORES: Record<GraphRelationType, number> = {
  emotional: 0.86,
  symbolic: 0.8,
  archetype: 0.76,
  narrative: 0.72,
  contrast: 0.64
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function minMaxNormalize(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (Math.abs(max - min) < 1e-9) {
    return scores.map((score) => (score > 0 ? 1 : 0));
  }

  return scores.map((score) => clamp((score - min) / (max - min), 0, 1));
}

export function normalizeBm25Scores(scores: number[]): number[] {
  return minMaxNormalize(scores.map((score) => Math.log1p(Math.max(0, score))));
}

export function normalizeVectorScores(scores: number[]): number[] {
  return minMaxNormalize(scores.map((score) => clamp((score + 1) / 2, 0, 1)));
}

export function scoreGraphRelation(options: {
  relationType: GraphRelationType;
  distance: number;
  seedScore: number;
}): number {
  const relationScore = GRAPH_RELATION_BASE_SCORES[options.relationType] ?? 0.6;
  const distancePenalty = options.distance <= 1 ? 1 : 1 / options.distance;
  const seedInfluence = 0.65 + clamp(options.seedScore, 0, 1) * 0.35;
  return Number(clamp(relationScore * distancePenalty * seedInfluence, 0, 1).toFixed(6));
}

export function normalizeGraphScores(scores: number[]): number[] {
  return minMaxNormalize(scores.map((score) => clamp(score, 0, 1)));
}
