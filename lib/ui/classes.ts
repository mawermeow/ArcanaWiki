import { cn } from "./cn.ts";

export const pageClass =
  "mx-auto w-[min(1120px,calc(100vw-32px))] py-8 pb-12 max-[640px]:w-[min(calc(100vw-20px),1120px)] max-[640px]:py-5 max-[640px]:pb-8";

export const panelClass =
  "rounded-lg border border-line bg-paper shadow-panel backdrop-blur-[14px]";

export const heroClass = cn(panelClass, "p-8 max-[640px]:p-5");

export const panelPaddingClass = cn(panelClass, "p-6 max-[640px]:p-5");

export const eyebrowClass =
  "m-0 mb-3 text-[0.78rem] font-bold tracking-[0.14em] text-accent uppercase";

export const sectionEyebrowClass =
  "m-0 text-[0.72rem] font-bold tracking-[0.14em] text-accent uppercase";

export const contentSectionTitleClass =
  "font-serif text-[1.28rem] leading-snug font-bold text-accent";

export const wikiPageTitleClass =
  "font-serif text-[clamp(2rem,4.8vw,3.2rem)] leading-[1.08] font-bold text-accent text-balance";

export const mutedTextClass = "text-muted";

export const ghostLinkClass =
  "border-b border-transparent text-muted no-underline hover:border-current";

export const primaryButtonClass =
  "cursor-pointer rounded-full border-0 bg-ink px-[18px] py-3 text-cream transition duration-150 ease-in-out hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] disabled:hover:translate-y-0";

export const secondaryButtonClass =
  "cursor-pointer rounded-full border-0 bg-accent-soft px-[18px] py-3 text-accent transition duration-150 ease-in-out hover:-translate-y-px";

export const ghostButtonClass =
  "cursor-pointer self-end rounded-full border border-line bg-transparent px-[18px] py-3 text-muted transition duration-150 ease-in-out hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55] disabled:hover:translate-y-0";

export const fieldClass = "grid gap-2";

export const fieldLabelClass = "text-[0.94rem] font-semibold";

export const fieldControlClass =
  "h-12 w-full rounded-md border border-line bg-surface px-4 py-0 leading-normal text-ink";

export const fieldSelectClass = cn(
  fieldControlClass,
  "appearance-none bg-size-[1rem] bg-position-[right_1rem_center] bg-no-repeat pr-10"
);

export const cardThumbClass =
  "aspect-[5/8.6] w-[72px] rounded-[10px] border border-line bg-cream object-cover shadow-card";

export const wikiProseClass = "wiki-prose";

export { cn };
