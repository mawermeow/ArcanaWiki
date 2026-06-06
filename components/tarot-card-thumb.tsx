import React from "react";
import { getCardImageSrc } from "../lib/pwa/card-image.ts";
import { cardThumbClass, cn } from "../lib/ui/classes.ts";

type TarotCardThumbProps = {
  cardId: string;
  title?: string;
  orientation?: "upright" | "reversed" | "unknown";
  className?: string;
};

export function TarotCardThumb({
  cardId,
  title,
  orientation = "upright",
  className
}: TarotCardThumbProps) {
  const src = getCardImageSrc(cardId);
  if (!src) {
    return null;
  }

  return (
    <img
      alt={title ?? cardId}
      className={cn(
        cardThumbClass,
        orientation === "reversed" && "rotate-180",
        className
      )}
      height={120}
      loading="lazy"
      src={src}
      width={72}
    />
  );
}
