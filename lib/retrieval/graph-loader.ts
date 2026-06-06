import { promises as fs } from "node:fs";

import type { RelationGraph } from "./types.ts";

export async function readRelationGraph(graphPath: string): Promise<RelationGraph> {
  const raw = await fs.readFile(graphPath, "utf8");
  return JSON.parse(raw) as RelationGraph;
}
