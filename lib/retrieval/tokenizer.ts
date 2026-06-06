import { normalizeText, uniqueSorted } from "./normalizer.ts";
import type { WikiPage } from "./types.ts";

const FALLBACK_TAROT_TERMS = [
  "正位",
  "逆位",
  "upright",
  "reversed",
  "love",
  "career",
  "work",
  "relationship",
  "tarot",
  "復合",
  "曖昧",
  "冷淡",
  "逃避",
  "分手",
  "工作",
  "轉職",
  "焦慮",
  "失眠",
  "情緒",
  "安全感",
  "對方",
  "靈性",
  "感情",
  "關係",
  "第三者",
  "自我探索",
  "情緒困惑"
];

type TokenizerConfig = {
  protectedPhrases: string[];
};

type PhraseMap = Map<string, string[]>;

function normalizePhrase(value: string): string {
  return normalizeText(value).toLowerCase();
}

function isAsciiWordChar(char: string): boolean {
  return /[a-z0-9_-]/i.test(char);
}

function isCjk(char: string): boolean {
  return /[\u3400-\u9fff]/.test(char);
}

function isSeparator(char: string): boolean {
  return /[\s.,!?;:()[\]{}"'`~@#$%^&*+=/\\|<>，。！？；：（）「」【】、《》]/.test(char);
}

function buildPhraseMap(phrases: string[]): PhraseMap {
  const map = new Map<string, string[]>();
  for (const phrase of phrases) {
    const first = phrase[0];
    const existing = map.get(first) ?? [];
    existing.push(phrase);
    existing.sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-Hant"));
    map.set(first, existing);
  }
  return map;
}

function expandOrientationToken(token: string): string[] {
  const expansions = [token];
  if (token.endsWith("逆位")) {
    expansions.push(token.slice(0, -2), "逆位");
  } else if (token.endsWith("正位")) {
    expansions.push(token.slice(0, -2), "正位");
  } else if (token.endsWith(" reversed")) {
    expansions.push(token.slice(0, -" reversed".length), "reversed");
  } else if (token.endsWith(" upright")) {
    expansions.push(token.slice(0, -" upright".length), "upright");
  }
  return expansions.filter(Boolean);
}

function tokenizeCjkSegment(segment: string, phraseMap: PhraseMap): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const push = (token: string) => {
    if (!token || seen.has(token)) {
      return;
    }
    seen.add(token);
    tokens.push(token);
  };

  if (segment.length <= 8) {
    push(segment);
  }

  for (let index = 0; index < segment.length; index += 1) {
    const candidates = phraseMap.get(segment[index]) ?? [];
    for (const candidate of candidates) {
      if (segment.startsWith(candidate, index)) {
        for (const expansion of expandOrientationToken(candidate)) {
          push(expansion);
        }
      }
    }
  }

  for (let size = 2; size <= Math.min(3, segment.length); size += 1) {
    for (let index = 0; index <= segment.length - size; index += 1) {
      push(segment.slice(index, index + size));
    }
  }

  return tokens;
}

export function createTokenizer(config: TokenizerConfig) {
  const protectedPhrases = uniqueSorted(config.protectedPhrases.map(normalizePhrase)).sort(
    (a, b) => b.length - a.length || a.localeCompare(b, "zh-Hant")
  );
  const phraseMap = buildPhraseMap(protectedPhrases);

  return function tokenize(input: string): string[] {
    const normalized = normalizePhrase(input);
    const tokens: string[] = [];

    for (let index = 0; index < normalized.length; ) {
      const current = normalized[index];
      if (!current || isSeparator(current)) {
        index += 1;
        continue;
      }

      const phraseCandidates = phraseMap.get(current) ?? [];
      const phraseMatch = phraseCandidates.find((candidate) =>
        normalized.startsWith(candidate, index)
      );
      if (phraseMatch) {
        tokens.push(...expandOrientationToken(phraseMatch));
        index += phraseMatch.length;
        continue;
      }

      if (isAsciiWordChar(current)) {
        let end = index + 1;
        while (end < normalized.length && isAsciiWordChar(normalized[end])) {
          end += 1;
        }
        const word = normalized.slice(index, end);
        tokens.push(word);
        if (word.includes("-")) {
          tokens.push(...word.split("-").filter(Boolean));
        }
        index = end;
        continue;
      }

      if (isCjk(current)) {
        let end = index + 1;
        while (end < normalized.length && isCjk(normalized[end])) {
          end += 1;
        }
        tokens.push(...tokenizeCjkSegment(normalized.slice(index, end), phraseMap));
        index = end;
        continue;
      }

      index += 1;
    }

    return tokens.filter(Boolean);
  };
}

function extractTitleAliases(page: WikiPage): string[] {
  const aliases = [
    page.title,
    page.titleZh ?? "",
    page.titleEn ?? "",
    page.pageId
  ].filter(Boolean);

  const titleMatch = page.title.match(/^([^（(]+)[（(]([^）)]+)[）)]$/);
  if (titleMatch) {
    aliases.push(titleMatch[1], titleMatch[2]);
  }

  return aliases;
}

export function buildProtectedPhrases(pages: WikiPage[]): string[] {
  const phrases = new Set<string>(FALLBACK_TAROT_TERMS);

  for (const page of pages) {
    for (const alias of extractTitleAliases(page)) {
      const normalized = normalizeText(alias);
      if (!normalized) {
        continue;
      }
      phrases.add(normalized);
      phrases.add(`${normalized} 正位`);
      phrases.add(`${normalized} 逆位`);
      phrases.add(`${normalized} upright`);
      phrases.add(`${normalized} reversed`);
      phrases.add(normalized.replace(/\s+/g, ""));
      phrases.add(`${normalized.replace(/\s+/g, "")}正位`);
      phrases.add(`${normalized.replace(/\s+/g, "")}逆位`);
    }
    for (const tag of [...page.tags, ...page.topics, ...page.keywords]) {
      phrases.add(normalizeText(tag));
    }
  }

  return uniqueSorted(Array.from(phrases));
}
