import { NavLink } from "react-router";
import { type Copy, useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const LABELS: Copy<{ nav: string; today: string; mistakes: string; progress: string }> = {
  en: { nav: "Main", today: "Today", mistakes: "Practice", progress: "Progress" },
  "pt-BR": { nav: "Principal", today: "Hoje", mistakes: "Praticar", progress: "Progresso" },
};

/** The three destinations. The active segment is paper on sand-soft. */
export function TabBar() {
  const label = useCopy(LABELS);
  const tabs = [
    { to: "/", label: label.today },
    { to: "/mistakes", label: label.mistakes },
    { to: "/progress", label: label.progress },
  ];
  return (
    <nav aria-label={label.nav} className="grid auto-cols-fr grid-flow-col rounded-pill bg-sand-soft p-[5px]">
      {tabs.map((tab) => (
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
