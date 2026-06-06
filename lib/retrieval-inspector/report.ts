import type {
  RetrievalEvalInspectionReport,
  RetrievalInspection
} from "./types.ts";

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function renderResults(title: string, results: Array<{
  rank: number;
  pageId: string;
  sectionTitle: string;
  score: number;
  sources?: string[];
  sourceScores?: Record<string, number | undefined>;
  matchedTerms: string[];
  preview: string;
}>): string[] {
  if (results.length === 0) {
    return [`## ${title}`, "", "_No results._", ""];
  }

  return [
    `## ${title}`,
    "",
    ...results.flatMap((result) => [
      `${result.rank}. \`${result.pageId}\` :: ${result.sectionTitle} | score=${result.score}${
        result.sources ? ` | sources=${result.sources.join(",")}` : ""
      }${result.sourceScores ? ` | breakdown=${JSON.stringify(result.sourceScores)}` : ""}`,
      `   matched terms: ${formatList(result.matchedTerms)}`,
      `   preview: ${result.preview}`
    ]),
    ""
  ];
}

export function renderQueryInspectionMarkdown(inspection: RetrievalInspection): string {
  const lines = [
    "# Retrieval Inspector Report",
    "",
    `- query: ${inspection.query}`,
    `- tokenized query: ${formatList(inspection.tokenizedQuery)}`,
    `- vector mode: ${inspection.vector.mode}`,
    `- vector available: ${inspection.vector.available}`,
    `- passed: ${inspection.analysis.passed}`,
    `- failure causes: ${formatList(inspection.analysis.failureCauses)}`,
    ""
  ];

  if (inspection.expected) {
    lines.push(
      "## Expected",
      "",
      `- cards: ${formatList(inspection.expected.cards ?? [])}`,
      `- topics: ${formatList(inspection.expected.topics ?? [])}`,
      `- keywords: ${formatList(inspection.expected.keywords ?? [])}`,
      ""
    );
  }

  lines.push(
    ...renderResults("BM25 Top Results", inspection.bm25.topResults),
    ...renderResults("Vector Top Results", inspection.vector.topResults),
    ...renderResults("Hybrid Final Results", inspection.hybrid.topResults),
    ...renderResults("Graph-expanded Results", inspection.hybrid.graphExpandedResults),
    "## Rejected Results",
    "",
    inspection.hybrid.response.diagnostics.rejectedResults.length > 0
      ? inspection.hybrid.response.diagnostics.rejectedResults
          .map(
            (result) =>
              `- \`${result.pageId}\` :: ${result.chunkId} | stage=${result.stage} | reason=${result.reason} | score=${result.score ?? "(n/a)"}`
          )
          .join("\n")
      : "_No rejected results._",
    "",
    "## Score Breakdown",
    "",
    inspection.hybrid.scoreBreakdown.length > 0
      ? inspection.hybrid.scoreBreakdown
          .map(
            (item) =>
              `- \`${item.pageId}\` :: ${item.chunkId} | source=${item.source} | raw=${item.rawScore} | normalized=${item.normalizedScore}`
          )
          .join("\n")
      : "_No normalized scores._",
    "",
    "## Selected Chunks Preview",
    "",
    inspection.hybrid.selectedChunksPreview.length > 0
      ? inspection.hybrid.selectedChunksPreview
          .map((item) => `- \`${item.pageId}\` :: ${item.sectionTitle} | ${item.preview}`)
          .join("\n")
      : "_No selected chunks._",
    "",
    "## Possible Issues",
    "",
    inspection.analysis.notes.length > 0
      ? inspection.analysis.notes.map((note) => `- ${note}`).join("\n")
      : "_No obvious issues detected._",
    ""
  );

  return lines.join("\n");
}

export function renderEvalInspectionMarkdown(report: RetrievalEvalInspectionReport): string {
  const lines = [
    "# Retrieval Eval Inspection",
    "",
    `- dataset: \`${report.datasetPath}\``,
    `- vector mode: ${report.vectorMode}`,
    `- queries: ${report.queryCount}`,
    `- bm25 top1/top3/top5: ${report.summary.bm25.top1} / ${report.summary.bm25.top3} / ${report.summary.bm25.top5}`,
    `- vector top1/top3/top5: ${report.summary.vector.top1} / ${report.summary.vector.top3} / ${report.summary.vector.top5}`,
    `- hybrid top1/top3/top5: ${report.summary.hybrid.top1} / ${report.summary.hybrid.top3} / ${report.summary.hybrid.top5}`,
    "",
    "## Failure Cases",
    "",
    report.failureCases.length > 0
      ? report.failureCases
          .map(
            (item) =>
              `- [${item.category}] ${item.query} | causes=${formatList(item.likelyCause)} | notes=${formatList(item.notes)}`
          )
          .join("\n")
      : "_No failure cases._",
    "",
    "## Per Query",
    ""
  ];

  for (const entry of report.queries) {
    lines.push(
      `### ${entry.category} :: ${entry.inspection.query}`,
      "",
      `- expected cards: ${formatList(entry.inspection.expected?.cards ?? [])}`,
      `- expected topics: ${formatList(entry.inspection.expected?.topics ?? [])}`,
      `- bm25 hit: ${entry.bm25.any} | top1/top3/top5=${entry.bm25.top1}/${entry.bm25.top3}/${entry.bm25.top5}`,
      `- vector hit: ${entry.vector.any} | top1/top3/top5=${entry.vector.top1}/${entry.vector.top3}/${entry.vector.top5}`,
      `- hybrid hit: ${entry.hybrid.any} | top1/top3/top5=${entry.hybrid.top1}/${entry.hybrid.top3}/${entry.hybrid.top5}`,
      `- likely cause: ${formatList(entry.likelyCause)}`,
      `- notes: ${formatList(entry.inspection.analysis.notes)}`,
      ""
    );
  }

  return lines.join("\n");
}
