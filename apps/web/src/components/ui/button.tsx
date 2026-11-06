import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** One primary button per screen. Secondary and ghost for everything else. */
const buttonVariants = cva(
  "inline-flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-pill border-none px-6 font-sans text-base font-bold no-underline transition-[transform,background-color] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-ink text-paper hover:bg-ink-soft",
        secondary: "bg-paper text-ink shadow-[inset_0_0_0_1.5px_var(--color-sand)] hover:bg-sand-soft",
        ghost: "bg-transparent text-taupe hover:text-ink",
      },
      block: { true: "flex w-full", false: "" },
    },
    defaultVariants: { variant: "primary", block: false },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (for example a link) with button styles. */
  asChild?: boolean;
}

export function Button({ className, variant, block, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, block }), className)}
      {...(asChild ? {} : { type })}
      {...props}
    />
  );
}
