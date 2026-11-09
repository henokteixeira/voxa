import type { RouteObject } from "react-router";
import { CHECK_IN_PATH, CheckInPage } from "@/features/check-in/check-in-page";
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
  // The check-in every 2 weeks takes the whole screen, like a session.
  { path: CHECK_IN_PATH.slice(1), element: <CheckInPage /> },
  // The voice review takes the whole screen, like a session.
  { path: "review", element: <ReviewPage /> },
  // A live session takes the whole screen: no tab bar.
  { path: "session/:mode", element: <SessionPage /> },
];
