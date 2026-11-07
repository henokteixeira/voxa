import { NavLink, useLocation } from "react-router";
import { type Copy, useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const LABELS: Copy<{ nav: string; today: string; mistakes: string; progress: string }> = {
  en: { nav: "Main", today: "Today", mistakes: "Practice", progress: "Progress" },
  "pt-BR": { nav: "Principal", today: "Hoje", mistakes: "Praticar", progress: "Progresso" },
};

const PATHS = ["/", "/mistakes", "/progress"] as const;

/**
 * The three destinations. The active segment is paper on sand-soft, and slides to the tab you pick.
 * `vertical` is the side column on wide screens.
 */
export function TabBar({ vertical = false }: { vertical?: boolean }) {
  const label = useCopy(LABELS);
  const { pathname } = useLocation();
  const labels = [label.today, label.mistakes, label.progress];
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const active = PATHS.findIndex((p) => p === path);

  return (
    <nav
      aria-label={label.nav}
      className={cn(
        "relative grid bg-sand-soft p-[5px] select-none",
        vertical ? "grid-flow-row rounded-[24px]" : "auto-cols-fr grid-flow-col rounded-pill",
      )}
    >
      {active >= 0 && (
        <span
          aria-hidden="true"
          data-testid="tab-indicator"
          className="vx-spring absolute rounded-pill bg-paper shadow-tab transition-transform duration-[280ms]"
          style={
            vertical
              ? { top: 5, left: 5, right: 5, height: "3rem", transform: `translateY(${active * 100}%)` }
              : {
                  top: 5,
                  bottom: 5,
                  left: 5,
                  width: `calc((100% - 10px) / ${PATHS.length})`,
                  transform: `translateX(${active * 100}%)`,
                }
          }
        />
      )}
      {PATHS.map((to, i) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              "relative flex h-12 items-center whitespace-nowrap rounded-pill text-sm font-bold text-taupe no-underline transition-colors duration-200 hover:text-ink",
              vertical ? "justify-start px-4" : "justify-center",
              isActive && "text-ink",
            )
          }
        >
          {labels[i]}
        </NavLink>
      ))}
    </nav>
  );
}
