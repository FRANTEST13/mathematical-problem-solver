import React from "react";
import ReactMarkdown from "react-markdown";

interface MathRendererProps {
  text: string;
}

export function MathRenderer({ text }: MathRendererProps) {
  if (!text) return null;

  // Step 1: Split by block equations ($$)
  const blockParts = text.split("$$");

  return (
    <div className="space-y-3 leading-relaxed">
      {blockParts.map((blockChunk, blockIdx) => {
        // Odd indices are block equations
        if (blockIdx % 2 !== 0) {
          const trimmedMath = blockChunk.trim();
          return (
            <div
              key={`block-math-${blockIdx}`}
              className="my-4 p-4 bg-[#F5F2ED] border border-[#E8E2D9] rounded-xl text-center font-mono text-sm overflow-x-auto text-[#7C8B74] shadow-xs font-semibold"
            >
              {trimmedMath}
            </div>
          );
        }

        // Even indices are standard text (which might contain inline equations $)
        const inlineParts = blockChunk.split("$");

        return (
          <div key={`text-block-${blockIdx}`} className="inline-block-container">
            {inlineParts.map((inlineChunk, inlineIdx) => {
              // Odd indices are inline equations
              if (inlineIdx % 2 !== 0) {
                const trimmedInline = inlineChunk.trim();
                return (
                  <code
                    key={`inline-math-${inlineIdx}`}
                    className="mx-1 px-1.5 py-0.5 bg-[#F5F2ED] border border-[#E8E2D9] rounded-sm font-mono text-xs text-[#7C8B74] font-semibold"
                  >
                    {trimmedInline}
                  </code>
                );
              }

              // Even indices are standard text/markdown
              return (
                <span key={`normal-text-${inlineIdx}`} className="markdown-body">
                  <ReactMarkdown>{inlineChunk}</ReactMarkdown>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
