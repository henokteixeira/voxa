import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./app/router";
import { LocaleProvider } from "./lib/i18n/locale-provider";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <RouterProvider router={createBrowserRouter(routes)} />
    </LocaleProvider>
  </StrictMode>,
);
