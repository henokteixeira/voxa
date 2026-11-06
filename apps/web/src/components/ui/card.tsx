import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Paper on linen, with the sand bottom edge as the only elevation. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-3 rounded-lg bg-paper p-5 text-ink shadow-card", className)} {...props} />;
}
