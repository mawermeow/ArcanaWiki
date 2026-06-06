import { cardIdToImageFilename } from "../wiki/card-id-mapping.ts";

const CARD_IMAGE_BASE_PATH = "/cards";

export function getCardImageSrc(cardId: string): string | undefined {
  const filename = cardIdToImageFilename(cardId);
  if (!filename) {
    return undefined;
  }

  return `${CARD_IMAGE_BASE_PATH}/${filename}`;
}
