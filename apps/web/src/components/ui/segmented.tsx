import { useId } from "react";
import { cn } from "@/lib/utils";

/** A setting with a few choices, one picked: title, hint, then the choices side by side. */
export function SegmentedSetting<T extends string | number | boolean>(props: {
  title: string;
  hint: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  const hintId = useId();
  return (
    <section className="flex flex-col gap-2">
      <h3 id={titleId} className="m-0 text-body-strong">
        {props.title}
      </h3>
      <p id={hintId} className="m-0 text-caption text-taupe">
        {props.hint}
      </p>
      <div role="group" aria-labelledby={titleId} aria-describedby={hintId} className="flex rounded-pill bg-sand-soft p-1">
        {props.options.map(({ value, label }) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={value === props.value}
            disabled={props.disabled}
            onClick={() => props.onChange(value)}
            className={cn(
              "min-h-11 flex-1 cursor-pointer rounded-pill border-none bg-transparent px-3 text-sm font-bold text-taupe disabled:cursor-not-allowed disabled:opacity-60",
              value === props.value && "bg-paper text-ink shadow-tab",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
