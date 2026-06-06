export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripMarkdown(markdown: string): string {
  return normalizeText(
    markdown
      .replace(/^---[\s\S]*?---\n/, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^[>#-]\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
  );
}

export function splitKeywordLine(value: string): string[] {
  return value
    .split(/[、,，；;／/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hant")
  );
}

export function slugifySegment(value: string): string {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "section";
}
