import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./app/router";
import { LocaleProvider } from "./lib/i18n/locale-provider";
import { SoundProvider } from "./lib/sound/sound-provider";
import { reportUncaughtErrors } from "./lib/report-error";
import "./styles/index.css";

// A production build (served on the same port) may have left a service worker that would keep serving
// its cached copy instead of the dev server. In development, remove it.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => void r.unregister()));
}

reportUncaughtErrors();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <SoundProvider>
        <RouterProvider router={createBrowserRouter(routes)} />
      </SoundProvider>
    </LocaleProvider>
  </StrictMode>,
);
