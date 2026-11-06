import { Outlet } from "react-router";
import { TabBar } from "@/components/tab-bar";
import { useOnline } from "@/hooks/use-online";
import { type Copy, useCopy } from "@/lib/i18n/locale";

const OFFLINE: Copy<string> = {
  en: "You're offline. Sessions need a connection.",
  "pt-BR": "Você está sem internet. As sessões precisam de conexão.",
};

/** Phone-first shell: content, then the tab bar. Centered at a comfortable width on desktop. */
export function AppLayout() {
  const online = useOnline();
  const offline = useCopy(OFFLINE);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <main className="flex flex-1 flex-col gap-5 px-5 pt-7">
        {!online && (
          <div role="status" className="flex items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-paper">
            {offline}
          </div>
        )}
        <Outlet />
      </main>
      <div className="sticky bottom-0 bg-linen px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        <TabBar />
      </div>
    </div>
  );
}
