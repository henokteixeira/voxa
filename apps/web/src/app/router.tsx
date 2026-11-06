import type { RouteObject } from "react-router";
import { MistakesPage } from "@/features/mistakes/mistakes-page";
import { ProgressPage } from "@/features/progress/progress-page";
import { SessionPage } from "@/features/session/session-page";
import { TodayPage } from "@/features/today/today-page";
import { AppLayout } from "./app-layout";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "mistakes", element: <MistakesPage /> },
      { path: "progress", element: <ProgressPage /> },
    ],
  },
  // A live session takes the whole screen: no tab bar.
  { path: "session/:mode", element: <SessionPage /> },
];
