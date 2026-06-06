import React from "react";
import { parseAnswerBody } from "../lib/answer/answer-body.ts";
import { cn, contentSectionTitleClass } from "../lib/ui/classes.ts";

type AnswerBodyProps = {
  text: string;
  className?: string;
};

export function AnswerBody({ text, className }: AnswerBodyProps) {
  const blocks = parseAnswerBody(text);

  if (blocks.length === 0) {
    return null;
  }

  const structured = blocks.some((block) => block.type === "section" || block.type === "list");

  if (!structured) {
    return (
      <div className={cn("text-[1.08rem] leading-[1.9] text-ink", className)}>
        {blocks.map((block, index) =>
          block.type === "paragraph" ? <p key={index}>{block.text}</p> : null
        )}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-1", className)}>
      {blocks.map((block, index) => {
        if (block.type === "section") {
          return (
            <h4
              className={cn(
                contentSectionTitleClass,
                "mt-6 mb-2 first:mt-0"
              )}
              key={`section-${index}`}
            >
              {block.title}
            </h4>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p className="mb-3 text-[1.08rem] leading-[1.9] text-ink" key={`paragraph-${index}`}>
              {block.text}
            </p>
          );
        }

        return (
          <ul className="mb-4 grid list-none gap-3 p-0" key={`list-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li className="grid grid-cols-[auto_1fr] gap-3" key={`${index}-${itemIndex}`}>
                <span
                  aria-hidden
                  className="mt-[0.55rem] size-2 shrink-0 rounded-full bg-accent ring-4 ring-accent/12"
                />
                <span className="text-[1.06rem] leading-[1.88] text-ink">{item}</span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
