export function isRetrievalDebugEnabled(): boolean {
  return process.env.TAROT_DEBUG_RETRIEVAL === "true";
}
