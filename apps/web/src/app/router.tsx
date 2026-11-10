import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import { CHECK_IN_PATH } from "@/features/check-in/paths";
import { TodayPage } from "@/features/today/today-page";
import { AppLayout } from "./app-layout";
import { PageLoading } from "./page-loading";

/** A page loaded when it is first opened, so the first screen does not wait for every other one. */
function page<Name extends string>(load: () => Promise<Record<Name, ComponentType>>, name: Name): Pick<RouteObject, "lazy" | "HydrateFallback"> {
  return { lazy: async () => ({ Component: (await load())[name] }), HydrateFallback: PageLoading };
}

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "talk", ...page(() => import("@/features/talk/talk-page"), "TalkPage") },
      { path: "mistakes", ...page(() => import("@/features/practice/practice-page"), "PracticePage") },
      { path: "mistakes/types/:typeId", ...page(() => import("@/features/practice/practice-page"), "PracticePage") },
      { path: "mistakes/patterns/:patternId", ...page(() => import("@/features/practice/practice-page"), "PracticePage") },
      { path: "progress", ...page(() => import("@/features/progress/progress-page"), "ProgressPage") },
      { path: "progress/level", ...page(() => import("@/features/progress/level-page"), "LevelPage") },
      { path: "memory", ...page(() => import("@/features/memory/memory-page"), "MemoryPage") },
    ],
  },
  // First run: welcome, microphone, then the level chat. Whole screen, no tab bar.
  { path: "onboarding", ...page(() => import("@/features/onboarding/onboarding-page"), "OnboardingPage") },
  // The check-in every 2 weeks takes the whole screen, like a session.
  { path: CHECK_IN_PATH.slice(1), ...page(() => import("@/features/check-in/check-in-page"), "CheckInPage") },
  { path: `${CHECK_IN_PATH.slice(1)}/:checkInId`, ...page(() => import("@/features/check-in/check-in-detail-page"), "CheckInDetailPage") },
  // The daily mission takes the whole screen; it opens on the first step not done.
  { path: "mission", ...page(() => import("@/features/mission/mission-page"), "MissionPage") },
  // The voice review takes the whole screen, like a session.
  { path: "review", ...page(() => import("@/features/practice/review-page"), "ReviewPage") },
  // A live session takes the whole screen: no tab bar.
  { path: "session/:mode", ...page(() => import("@/features/session/session-page"), "SessionPage") },
  // An old or mistyped address goes back to Today, not to an error page.
  { path: "*", element: <Navigate to="/" replace /> },
];
