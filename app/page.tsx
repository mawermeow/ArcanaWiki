import React from "react";
import { TarotChatClient } from "../components/tarot-chat-client.tsx";
import { readTarotCardOptions } from "../lib/pwa/card-catalog.ts";
import { isRetrievalDebugEnabled } from "../lib/pwa/env.ts";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cardOptions = await readTarotCardOptions().catch(() => []);
  const params = (await searchParams) ?? {};
  const cardIdParam = params.cardId;
  const initialCardId = Array.isArray(cardIdParam) ? cardIdParam[0] : cardIdParam;

  return (
    <main className="page">
      <nav className="top-nav">
        <a className="ghost-link" href="/wiki">
          Public Tarot Wiki
        </a>
      </nav>
      <TarotChatClient
        cardOptions={cardOptions}
        debugEnabled={isRetrievalDebugEnabled()}
        initialCardId={typeof initialCardId === "string" ? initialCardId : undefined}
      />
    </main>
  );
}
