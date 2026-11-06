import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Today" },
  { to: "/mistakes", label: "Mistakes" },
  { to: "/progress", label: "Progress" },
] as const;

/** The three destinations. The active segment is paper on sand-soft. */
export function TabBar() {
  return (
    <nav aria-label="Main" className="grid auto-cols-fr grid-flow-col rounded-pill bg-sand-soft p-[5px]">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              "flex min-h-12 items-center justify-center rounded-pill text-sm font-bold text-taupe no-underline",
              isActive && "bg-paper text-ink shadow-tab",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
