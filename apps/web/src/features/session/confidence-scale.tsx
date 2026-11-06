import { useId } from "react";
import { cn } from "@/lib/utils";

/** The 1–5 confidence check. `before` outlines the learner's answer from before the session. */
export function ConfidenceScale(props: {
  label: string;
  /** Words under each end of the scale. */
  low: string;
  high: string;
  value: number | null;
  onChange: (value: number) => void;
  before?: number | null;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-none p-0">
      <legend className="sr-only">{props.label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={cn(
              "flex min-h-16 cursor-pointer items-center justify-center rounded-sm bg-paper font-serif text-[24px] text-ink shadow-card has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-mist-ink",
              props.before === n && "ring-2 ring-taupe ring-inset",
              props.value === n && "bg-ink text-paper",
            )}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={props.value === n}
              onChange={() => props.onChange(n)}
              className="sr-only"
            />
            {n}
          </label>
        ))}
      </div>
      <div className="flex justify-between text-caption text-taupe" aria-hidden="true">
        <span>{props.low}</span>
        <span>{props.high}</span>
      </div>
    </fieldset>
  );
}
