import React from "react";
import { cn, eyebrowClass } from "../lib/ui/classes.ts";

type PanelSectionHeaderProps = {
  eyebrow: string;
  title: string;
  titleId?: string;
  className?: string;
};

export function PanelSectionHeader({ eyebrow, title, titleId, className }: PanelSectionHeaderProps) {
  return (
    <div className={cn("mb-6 border-b border-line pb-4", className)}>
      <p className={eyebrowClass}>{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
    </div>
  );
}
