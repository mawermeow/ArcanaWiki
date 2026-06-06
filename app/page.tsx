import React from "react";
import { TarotChatClient } from "../components/tarot-chat-client.tsx";
import { readTarotCardOptions } from "../lib/pwa/card-catalog.ts";
import { isRetrievalDebugEnabled } from "../lib/pwa/env.ts";

export default async function HomePage() {
  const cardOptions = await readTarotCardOptions().catch(() => []);

  return (
    <main className="page">
      <TarotChatClient
        cardOptions={cardOptions}
        debugEnabled={isRetrievalDebugEnabled()}
      />
    </main>
  );
}
