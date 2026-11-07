import type { RouteObject } from "react-router";
import { MemoryPage } from "@/features/memory/memory-page";
import { OnboardingPage } from "@/features/onboarding/onboarding-page";
import { PracticePage } from "@/features/practice/practice-page";
import { ReviewPage } from "@/features/practice/review-page";
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
      { path: "mistakes", element: <PracticePage /> },
      { path: "mistakes/types/:typeId", element: <PracticePage /> },
      { path: "mistakes/patterns/:patternId", element: <PracticePage /> },
      { path: "progress", element: <ProgressPage /> },
      { path: "progress/level", element: <LevelPage /> },
      { path: "memory", element: <MemoryPage /> },
    ],
  },
  // First run: welcome, microphone, then the level chat. Whole screen, no tab bar.
  { path: "onboarding", element: <OnboardingPage /> },
  // The voice review takes the whole screen, like a session.
  { path: "review", element: <ReviewPage /> },
  // A live session takes the whole screen: no tab bar.
  { path: "session/:mode", element: <SessionPage /> },
];
