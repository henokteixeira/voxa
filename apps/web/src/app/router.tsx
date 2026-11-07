import type { RouteObject } from "react-router";
import { OnboardingPage } from "@/features/onboarding/onboarding-page";
import { MistakesPage } from "@/features/mistakes/mistakes-page";
import { LevelPage } from "@/features/progress/level-page";
import { ProgressPage } from "@/features/progress/progress-page";
import { SessionPage } from "@/features/session/session-page";
import { TodayPage } from "@/features/today/today-page";
import { AppLayout } from "./app-layout";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TodayPage /> },
      // `wide`: on wide screens the page uses more room (list and detail side by side).
      { path: "mistakes", element: <MistakesPage />, handle: { wide: true } },
      { path: "progress", element: <ProgressPage /> },
      { path: "progress/level", element: <LevelPage /> },
    ],
  },
  // First run: welcome, microphone, then the level chat. Whole screen, no tab bar.
  { path: "onboarding", element: <OnboardingPage /> },
  // A live session takes the whole screen: no tab bar.
  { path: "session/:mode", element: <SessionPage /> },
];
