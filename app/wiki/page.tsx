import React from "react";
import { PublicWikiBrowser } from "../../components/public-wiki-browser.tsx";
import { getPublicWikiBrowseData } from "../../lib/wiki-public/loader.ts";

export default async function PublicWikiIndexPage() {
  const browseData = await getPublicWikiBrowseData();

  return (
    <main className="page">
      <PublicWikiBrowser {...browseData} />
    </main>
  );
}
