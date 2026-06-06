import React from "react";
import { getCardImageSrc } from "../lib/pwa/card-image.ts";
import { cardThumbClass, cn } from "../lib/ui/classes.ts";

type TarotCardThumbSize = "sm" | "md" | "lg";

type TarotCardThumbProps = {
  cardId: string;
  title?: string;
  orientation?: "upright" | "reversed" | "unknown";
  className?: string;
  size?: TarotCardThumbSize;
};

const sizeClass: Record<TarotCardThumbSize, string> = {
  sm: "w-[52px] rounded-lg",
  md: "w-[72px] rounded-[10px]",
  lg: "w-[min(132px,28vw)] max-w-full rounded-[14px]"
};

const dimensionBySize: Record<TarotCardThumbSize, { width: number; height: number }> = {
  sm: { width: 52, height: 89 },
  md: { width: 72, height: 124 },
  lg: { width: 132, height: 227 }
};

export function TarotCardThumb({
  cardId,
  title,
  orientation = "upright",
  className,
  size = "md"
}: TarotCardThumbProps) {
  const src = getCardImageSrc(cardId);
  if (!src) {
    return null;
  }

  const dimensions = dimensionBySize[size];

  return (
    <img
      alt={title ?? cardId}
      className={cn(
        cardThumbClass,
        sizeClass[size],
        orientation === "reversed" && "rotate-180",
        className
      )}
      height={dimensions.height}
      loading="lazy"
      src={src}
      width={dimensions.width}
    />
  );
}
