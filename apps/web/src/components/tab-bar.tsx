import { NavLink, useLocation } from "react-router";
import { type Copy, useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const LABELS: Copy<{ nav: string; today: string; talk: string; review: string; progress: string }> = {
  en: { nav: "Main", today: "Today", talk: "Talk", review: "Review", progress: "Progress" },
  "pt-BR": { nav: "Principal", today: "Hoje", talk: "Conversar", review: "Revisar", progress: "Progresso" },
};

const PATHS = ["/", "/talk", "/mistakes", "/progress"] as const;

/**
 * The four destinations: Today (the mission), Talk (free conversations), Review (patterns), Progress. The active segment is paper on sand-soft, and slides to the tab you pick.
 * `vertical` is the side column on wide screens.
 */
export function TabBar({ vertical = false }: { vertical?: boolean }) {
  const label = useCopy(LABELS);
  const { pathname } = useLocation();
  const labels = [label.today, label.talk, label.review, label.progress];
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  // A page inside a tab (e.g. a pattern in Practice) keeps the tab active.
  const active = PATHS.findIndex((p) => p === path || (p !== "/" && path.startsWith(`${p}/`)));

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
