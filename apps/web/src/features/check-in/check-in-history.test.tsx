import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import type { ApiClient } from "@/lib/api";
import { CheckInDetailPage } from "./check-in-detail-page";
import { CheckInHistory } from "./check-in-history";

const pace = (id: string, recordedAt: string, wordsPerMinute: number, longPauses: number) => ({ id, recordedAt, wordsPerMinute, longPauses });
const older = pace("c1", "2026-11-09T12:00:00Z", 68, 9);
const newer = pace("c2", "2026-11-23T12:00:00Z", 81, 4);

describe("Check-in history", () => {
  it("shows each check-in's pace, oldest first, and opens one", async () => {
    const api = {
      checkIns: vi.fn().mockResolvedValue({ task: "present_project", limitMs: 120_000, dueAt: "2026-12-07T12:00:00Z", due: false, checkIns: [newer, older] }),
      checkIn: vi.fn().mockResolvedValue({ checkIn: { ...newer, transcript: "" }, previous: older }),
    };
    const router = createMemoryRouter(
      [
        { path: "/progress", element: <CheckInHistory /> },
        { path: "/check-in/:checkInId", element: <CheckInDetailPage /> },
      ],
      { initialEntries: ["/progress"] },
    );
    render(
      <ApiProvider value={api as unknown as ApiClient}>
        <RouterProvider router={router} />
      </ApiProvider>,
    );

    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Nov 9: 68 words per minute. Open this check-in",
      "Nov 23: 81 words per minute. Open this check-in",
    ]);
    expect(screen.getByText("Next check-in: Dec 7")).toBeInTheDocument();

    await userEvent.click(links[1]);
    expect(await screen.findByRole("heading", { name: "Last time you said 68 words a minute. Today, 81." })).toBeInTheDocument();
    expect(api.checkIn).toHaveBeenCalledWith("c2");
  });
});
