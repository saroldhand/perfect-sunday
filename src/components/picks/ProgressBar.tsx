"use client";

type Props = {
  total: number;
  currentIndex: number;
  isComplete: (index: number) => boolean;
  onJump: (index: number) => void;
};

export function ProgressBar({ total, currentIndex, isComplete, onJump }: Props) {
  return (
    <div className="flex gap-1" role="tablist" aria-label="Games">
      {Array.from({ length: total }).map((_, i) => {
        const done = isComplete(i);
        const current = i === currentIndex;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={current}
            aria-label={`Game ${i + 1}${done ? ", picked" : ""}`}
            onClick={() => onJump(i)}
            // The segment itself is a 3px hairline, but the button around it is
            // full height so the tap target clears 44pt without the bar looking
            // chunky.
            className="group flex-1 py-3"
          >
            <span
              className={`block h-[4px] w-full rounded-full transition-colors duration-[120ms] ${
                current
                  ? "bg-[linear-gradient(90deg,#ffd44d,#ff7a1a)]"
                  : done
                    ? "bg-[rgba(255,180,36,0.45)]"
                    : "bg-[var(--color-border)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
