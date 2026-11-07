import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useMatches } from "react-router";
import { TabBar } from "@/components/tab-bar";
import { useMediaQuery, WIDE } from "@/hooks/use-media-query";
import { useOnline } from "@/hooks/use-online";
import { type Copy, useCopy } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const OFFLINE: Copy<string> = {
  en: "You're offline. Sessions need a connection.",
  "pt-BR": "Você está sem internet. As sessões precisam de conexão.",
};

/**
 * The app always fills the window and never scrolls as a whole: only a screen's own content scrolls,
 * and only when it doesn't fit. Phone: content, then the tab bar. Wide screens: a side column.
 */
export function AppLayout() {
  const online = useOnline();
  const offline = useCopy(OFFLINE);
  const wide = useMediaQuery(WIDE);
  const { pathname } = useLocation();
  const widePage = useMatches().some((m) => (m.handle as { wide?: boolean } | undefined)?.wide);
  const scroller = useRef<HTMLElement>(null);
  // A new tab starts at its top, not where the last one was scrolled to.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [pathname]);

  const content = (
    <main ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      {/* Keyed by path so each tab fades in when you switch to it. */}
      <div
        key={pathname}
        className={cn(
          "vx-page-in mx-auto flex w-full max-w-[480px] flex-1 flex-col gap-5 px-5 pt-7 pb-5 lg:px-8 lg:pt-10",
          widePage ? "lg:max-w-[1040px]" : "lg:max-w-[560px]",
        )}
      >
        {!online && (
          <div role="status" className="flex items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper">
            {offline}
          </div>
        )}
        <Outlet />
      </div>
    </main>
  );

  if (wide) {
    return (
      <div className="flex h-dvh w-full">
        <header className="flex w-[240px] shrink-0 flex-col gap-6 border-r border-sand px-4 py-7">
          <span className="pl-2 font-serif text-2xl [font-variation-settings:'SOFT'_60]">Voxa</span>
          <TabBar vertical />
        </header>
        {content}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col">
      {content}
      <div className="shrink-0 px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))]">
        <TabBar />
      </div>
    </div>
  );
}
