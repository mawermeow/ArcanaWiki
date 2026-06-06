import type { RetrievalDocument } from "../retrieval/types.ts";
import type {
  RetrievalFailureCause,
  RetrievalInspection,
  RetrievalInspectionExpected
} from "./types.ts";
import { searchCorpusForExpected } from "./utils.ts";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function classifyFailureCauses(options: {
  inspection: RetrievalInspection;
  expected?: RetrievalInspectionExpected;
  documents: RetrievalDocument[];
}): RetrievalFailureCause[] {
  const { inspection, expected, documents } = options;
  const causes = new Set<RetrievalFailureCause>();
  const corpusCoverage = searchCorpusForExpected(documents, expected);
  const hybridGraphOnlyCount = inspection.hybrid.graphExpandedResults.filter(
    (result) => !result.sources?.includes("bm25") && !result.sources?.includes("vector")
  ).length;

  if (expected && !corpusCoverage.hasExpectedCard && !corpusCoverage.hasExpectedTopic && !corpusCoverage.hasExpectedKeyword) {
    causes.add("missing-wiki-content");
  }

  if (
    expected &&
    !inspection.bm25.hitStatus.any &&
    inspection.tokenizedQuery.length <= 2 &&
    (corpusCoverage.hasExpectedCard || corpusCoverage.hasExpectedTopic || corpusCoverage.hasExpectedKeyword)
  ) {
    causes.add("bad-tokenization");
  }

  if (
    inspection.vector.available &&
    !inspection.vector.hitStatus.top5 &&
    inspection.bm25.hitStatus.top5 &&
    !inspection.hybrid.hitStatus.top5
  ) {
    causes.add("weak-vector-match");
  }

  if (
    (inspection.bm25.hitStatus.top5 || inspection.vector.hitStatus.top5) &&
    !inspection.hybrid.hitStatus.top5
  ) {
    causes.add("bad-score-normalization");
  }

  if (
    !inspection.hybrid.hitStatus.top5 &&
    hybridGraphOnlyCount > 0 &&
    inspection.hybrid.response.diagnostics.graphExpandedResults.length >= hybridGraphOnlyCount
  ) {
    causes.add("graph-noise");
  }

  if (
    expected?.topics?.length &&
    !inspection.bm25.hitStatus.topicHit &&
    !inspection.vector.hitStatus.topicHit &&
    !inspection.hybrid.hitStatus.topicHit &&
    corpusCoverage.hasExpectedCard
  ) {
    causes.add("bad-metadata");
  }

  if (causes.size === 0 && !inspection.analysis.passed) {
    causes.add("unknown");
  }

  return unique(Array.from(causes));
}

export function buildInspectionNotes(inspection: RetrievalInspection): string[] {
  const notes: string[] = [];

  if (inspection.tokenizedQuery.length === 0) {
    notes.push("Tokenizer did not produce any query tokens.");
  }
  if (inspection.bm25.topResults.length === 0) {
    notes.push("BM25 returned no top results.");
  }
  if (!inspection.vector.available) {
    notes.push("Vector inspection ran without a query embedding; vector results are unavailable in this run.");
  } else if (inspection.vector.topResults.length === 0) {
    notes.push("Vector search returned no top results.");
  }
  if (inspection.hybrid.topResults.length === 0) {
    notes.push("Hybrid search returned no final results.");
  }
  if (inspection.hybrid.response.diagnostics.rejectedResults.length > inspection.hybrid.topResults.length) {
    notes.push("Hybrid rejected more candidates than it kept; review normalization and graph thresholds.");
  }
  if (
    inspection.hybrid.graphExpandedResults.filter(
      (result) => !result.sources?.includes("bm25") && !result.sources?.includes("vector")
    ).length >= 2
  ) {
    notes.push("Graph expansion introduced multiple graph-only candidates; inspect for graph noise.");
  }

  return notes;
}
