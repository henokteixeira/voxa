import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { type VoiceDeps, VoiceDepsContext } from "@/features/session/voice-deps";
import type { ApiClient } from "@/lib/api";
import { ReviewPage } from "./review-page";

// No microphone here: the learner types.
const deps = { openMicrophone: vi.fn().mockRejectedValue(new Error("blocked")) } as unknown as VoiceDeps;
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
const card = (id: string, name: string) => ({ cardId: `c-${id}`, item: { subject: { kind: "pattern", id }, language: "en", name }, cue: `Cue ${id}` });

function renderReview(path: string, api: Partial<ApiClient>) {
  const router = createMemoryRouter(
    [
      { path: "/review", element: <ReviewPage /> },
      { path: "/mistakes", element: <p>Practice tab</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <ApiProvider value={api as ApiClient}>
      <VoiceDepsContext.Provider value={deps}>
        <RouterProvider router={router} />
      </VoiceDepsContext.Provider>
    </ApiProvider>,
  );
  return router;
}

describe("Review", () => {
  it("reviews what is due, then says when each one comes back", async () => {
    const reviewCard = vi.fn().mockImplementation(async ({ id }: { id: string }) => card(id, id === "p1" ? "Past" : "Wait for"));
    const answerReview = vi.fn().mockResolvedValue({ recalled: false, answer: "One way.", rule: "Rule.", nextDueAt: tomorrow(), xp: 1 });
    const due = [{ subject: { kind: "pattern", id: "p1" } }, { subject: { kind: "pattern", id: "p2" } }];
    const router = renderReview("/review", { reviewOverview: vi.fn().mockResolvedValue({ due, nextDueAt: null }), reviewCard, answerReview });

    expect(await screen.findByText("“Cue p1”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "I don't know, show me" }));
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await userEvent.type(await screen.findByLabelText("Your answer"), "I'm waiting for it{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Finish" }));

    expect(screen.getByRole("heading", { name: "Review done" })).toBeInTheDocument();
    expect(screen.getByText("+2 XP toward today's goal")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pasttomorrow", "Wait fortomorrow"]);
    await userEvent.click(screen.getByRole("link", { name: "Done" }));
    expect(router.state.location.pathname).toBe("/mistakes");
  });

  it("reviews one pattern from its address, and goes back when closed before answering", async () => {
    const reviewOverview = vi.fn();
    const reviewCard = vi.fn().mockResolvedValue(card("p9", "Past"));
    const router = renderReview("/review?pattern=p9", { reviewOverview, reviewCard });

    expect(await screen.findByText("“Cue p9”")).toBeInTheDocument();
    expect(reviewCard).toHaveBeenCalledWith({ kind: "pattern", id: "p9" });
    expect(reviewOverview).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(router.state.location.pathname).toBe("/mistakes");
  });

  it("says when nothing is due", async () => {
    renderReview("/review", { reviewOverview: vi.fn().mockResolvedValue({ due: [], nextDueAt: null }) });
    expect(await screen.findByText("Nothing to review right now.")).toBeInTheDocument();
  });
});
