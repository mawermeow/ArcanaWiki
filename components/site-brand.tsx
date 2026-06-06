import React from "react";
import { cn, eyebrowClass } from "../lib/ui/classes.ts";

type SiteBrandProps = {
  className?: string;
};

export function SiteBrand({ className }: SiteBrandProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        alt=""
        aria-hidden
        className="size-8 shrink-0 rounded-lg border border-line bg-paper shadow-card"
        height={32}
        src="/brand-mark.svg"
        width={32}
      />
      <p className={cn(eyebrowClass, "mb-0")}>Public Tarot Wiki</p>
    </div>
  );
}
