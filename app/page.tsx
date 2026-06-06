import React from "react";
import { TarotChatClient } from "../components/tarot-chat-client.tsx";
import { readTarotCardOptions } from "../lib/pwa/card-catalog.ts";
import { isRetrievalDebugEnabled } from "../lib/pwa/env.ts";
import { ghostLinkClass, pageClass } from "../lib/ui/classes.ts";

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
    <main className={pageClass}>
      <nav className="flex justify-end px-0 pt-1 pb-4">
        <a className={ghostLinkClass} href="/wiki">
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
