import path from "node:path";
import { promises as fs } from "node:fs";

import type { BM25Index } from "./types.ts";

export async function writeBm25Index(indexPath: string, index: BM25Index): Promise<void> {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2) + "\n", "utf8");
}

export async function readBm25Index(indexPath: string): Promise<BM25Index> {
  const raw = await fs.readFile(indexPath, "utf8");
  return JSON.parse(raw) as BM25Index;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function writeTextFile(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}
