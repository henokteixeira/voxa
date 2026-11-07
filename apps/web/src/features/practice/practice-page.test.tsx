import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import type { ApiClient, PracticeView, ReviewOverview } from "@/lib/api";
import { PracticePage } from "./practice-page";

const now = new Date(2026, 10, 7, 9, 0); // Saturday
const on = (day: number) => new Date(2026, 10, day, 9, 0).toISOString();

const practice: PracticeView = {
  patterns: [
    {
      id: "p-past",
      category: "verb_tense",
      name: "Past for finished actions",
      rule: "Ação que já terminou: verbo no passado.",
      status: "improving",
      dueAt: on(7),
      occurrences: 5,
      sentences: [
        { id: "m1", original: "I finish it yesterday", correction: "I finished it yesterday.", occurrences: 3, lastSeenAt: on(6) },
        { id: "m2", original: "Last week we go", correction: "Last week we went.", occurrences: 2, lastSeenAt: on(5) },
      ],
    },
    { id: "p-will", category: "verb_tense", name: "“Will” for plans", rule: "Will.", status: "mastered", dueAt: on(21), occurrences: 1, sentences: [] },
    { id: "p-wait", category: "articles_prepositions", name: "“Wait for” something", rule: "Wait for.", status: "new", dueAt: on(10), occurrences: 1, sentences: [] },
  ],
  newWords: [{ id: "n1", word: "deadline", said: "prazo", status: "new", dueAt: on(8) }],
  earlier: [],
};
const nothingDue: ReviewOverview = { due: [], nextDueAt: on(10) };

function renderPage(api: Partial<ApiClient>) {
  const router = createMemoryRouter([{ path: "/mistakes", element: <PracticePage now={now} /> }, { path: "/review", element: <p>review</p> }], {
    initialEntries: ["/mistakes"],
  });
  render(
    <ApiProvider value={api as ApiClient}>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return router;
}

describe("Practice", () => {
  it("groups patterns by type, with when each comes back, and says when the next review is", async () => {
    renderPage({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue(nothingDue) });

    const verbs = await screen.findByRole("region", { name: "Verb tense" });
    expect(within(verbs).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Past for finished actionsImproving · Review today",
      "“Will” for plansMastered",
    ]);
    expect(screen.getByRole("region", { name: "Articles and prepositions" })).toHaveTextContent("“Wait for” somethingNew · Review Tue");
    expect(screen.getByRole("region", { name: "Nothing to review today" })).toHaveTextContent("Next review: Tue · 1 item");

    await userEvent.click(screen.getByRole("button", { name: "New words · 1" }));
    expect(screen.getByRole("list", { name: "New words · 1" })).toHaveTextContent("deadlineprazoNew · Review tomorrow");
  });

  it("offers the voice review when something is due", async () => {
    const due = { due: [{ subject: { kind: "pattern", id: "p-past" } }], nextDueAt: null } as unknown as ReviewOverview;
    const router = renderPage({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue(due) });

    expect(await screen.findByRole("region", { name: "1 item to review today" })).toHaveTextContent("By voice · about 3 min");
    await userEvent.click(screen.getByRole("link", { name: "Start review" }));
    expect(router.state.location.pathname).toBe("/review");
  });

  it("opens a pattern with its rule and the learner's sentences, to practice it", async () => {
    const router = renderPage({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue(nothingDue) });
    await userEvent.click(await screen.findByRole("button", { name: /Past for finished actions/ }));

    expect(screen.getByRole("heading", { name: "Past for finished actions" })).toBeInTheDocument();
    expect(screen.getByText("Ação que já terminou: verbo no passado.")).toBeInTheDocument();
    expect(screen.getByText("5 times")).toBeInTheDocument();
    const sentences = within(screen.getByRole("region", { name: "Your sentences" })).getAllByRole("listitem");
    expect(sentences.map((s) => s.textContent)).toEqual([
      "I finish it yesterdayI finished it yesterday.Not a mistake?",
      "Last week we goLast week we went.Not a mistake?",
    ]);

    await userEvent.click(screen.getByRole("link", { name: "Practice this · 1 min" }));
    expect(router.state.location).toMatchObject({ pathname: "/review", search: "?pattern=p-past" });
  });

  it("takes a sentence out of the bank and reloads the pattern", async () => {
    const load = vi.fn().mockResolvedValue(practice);
    const dismissMistake = vi.fn().mockResolvedValue(undefined);
    renderPage({ practice: load, reviewOverview: vi.fn().mockResolvedValue(nothingDue), dismissMistake });
    await userEvent.click(await screen.findByRole("button", { name: /Past for finished actions/ }));
    await userEvent.click(screen.getAllByRole("button", { name: "Not a mistake?" })[1]);
    await userEvent.click(screen.getByRole("button", { name: "This isn't a mistake" }));
    await userEvent.click(screen.getByRole("button", { name: "Both ways are correct" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from bank" }));

    expect(dismissMistake).toHaveBeenCalledWith("m2", "both_correct");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Past for finished actions" })).toBeInTheDocument();
  });

  it("asks to try again when it can't load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(practice);
    renderPage({ practice: load, reviewOverview: vi.fn().mockResolvedValue(nothingDue) });
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Verb tense" })).toBeInTheDocument();
  });
});
