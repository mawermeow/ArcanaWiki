import React from "react";
import { getCardImageSrc } from "../lib/pwa/card-image.ts";

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

  const classes = [
    "tarot-card-thumb",
    orientation === "reversed" ? "reversed" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <img
      alt={title ?? cardId}
      className={classes}
      height={120}
      loading="lazy"
      src={src}
      width={72}
    />
  );
}
