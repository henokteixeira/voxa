import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import type { ApiClient, PracticePattern, PracticeView, ReviewOverview } from "@/lib/api";
import { PracticePage } from "./practice-page";

const now = new Date(2026, 10, 7, 9, 0); // Saturday
const on = (day: number) => new Date(2026, 10, day, 9, 0).toISOString();

const pattern = (p: Partial<PracticePattern> & Pick<PracticePattern, "id" | "category" | "name" | "status" | "dueAt">): PracticePattern => ({
  rule: "Rule.",
  occurrences: 1,
  sentences: [],
  ...p,
});

const practice: PracticeView = {
  patterns: [
    pattern({
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
    }),
    pattern({ id: "p-will", category: "verb_tense", name: "“Will” for plans", status: "mastered", dueAt: on(21) }),
    pattern({ id: "p-routine", category: "verb_tense", name: "Present for routines", status: "new", dueAt: on(13) }),
    pattern({ id: "p-since", category: "verb_tense", name: "“Since” with the present perfect", status: "new", dueAt: on(10) }),
    pattern({ id: "p-wait", category: "articles_prepositions", name: "“Wait for” something", status: "new", dueAt: on(9) }),
    pattern({ id: "p-agree", category: "agreement", name: "“She works”, with the s", status: "mastered", dueAt: on(30) }),
  ],
  newWords: [
    { id: "n1", word: "deadline", said: "prazo", status: "new", dueAt: on(8) },
    { id: "n2", word: "blocker", said: "impedimento", status: "mastered", dueAt: on(28) },
  ],
  earlier: [{ id: "e1", category: "grammar", original: "I has", correction: "I have", occurrences: 1 }],
};
const nothingDue: ReviewOverview = { due: [], nextDueAt: on(10) };

function renderPage(api: Partial<ApiClient>, path = "/mistakes") {
  const router = createMemoryRouter(
    [
      { path: "/mistakes", element: <PracticePage now={now} /> },
      { path: "/mistakes/types/:typeId", element: <PracticePage now={now} /> },
      { path: "/mistakes/patterns/:patternId", element: <PracticePage now={now} /> },
      { path: "/review", element: <p>review</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <ApiProvider value={api as ApiClient}>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return router;
}

const loaded = () => ({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue(nothingDue) });

describe("Practice", () => {
  it("lists one row per type, due today first, then by next review, mastered types last", async () => {
    renderPage(loaded());

    const types = await screen.findByRole("region", { name: "By type" });
    expect(within(types).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Verb tense4 patterns41 today",
      "New words2 words2tomorrow",
      "Articles and prepositions1 pattern1Mon",
      "Agreement1 pattern1Mastered",
    ]);
    expect(within(types).getAllByRole("img").map((bar) => bar.getAttribute("aria-label"))).toEqual([
      "2 new, 1 improving, 1 mastered",
      "1 new, 1 mastered",
      "1 new",
      "1 mastered",
    ]);
    expect(screen.getByRole("region", { name: "Nothing to review right now" })).toHaveTextContent("Next review: Tue");
    expect(screen.getByRole("link", { name: /From before patterns/ })).toHaveTextContent("1");
  });

  it("opens a type with its patterns in groups, the mastered ones folded", async () => {
    const router = renderPage(loaded());
    await userEvent.click(await screen.findByRole("link", { name: /Verb tense/ }));

    expect(router.state.location.pathname).toBe("/mistakes/types/verb_tense");
    expect(screen.getByRole("heading", { name: "Verb tense" })).toHaveFocus();
    expect(screen.getByRole("img", { name: "2 new, 1 improving, 1 mastered" })).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "Review today" });
    expect(within(today).getAllByRole("link").map((l) => l.textContent)).toEqual(["Improving · Past for finished actionsReview today"]);
    const upcoming = screen.getByRole("region", { name: "Coming up" });
    expect(within(upcoming).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "New · “Since” with the present perfectReview Tue",
      "New · Present for routinesReview Fri",
    ]);
    const mastered = screen.getByRole("region", { name: "Mastered · 1" });
    expect(within(mastered).queryByRole("link")).toBeNull();
    await userEvent.click(within(mastered).getByRole("button", { name: "Mastered · 1", expanded: false }));
    expect(within(mastered).getByRole("link")).toHaveTextContent("“Will” for plansMastered");

    await userEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(await screen.findByRole("region", { name: "By type" })).toBeInTheDocument();
  });

  it("shows the new words as a type, with what the learner said", async () => {
    renderPage(loaded(), "/mistakes/types/new_words");
    expect(await screen.findByRole("heading", { name: "New words" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Coming up" })).getByRole("listitem")).toHaveTextContent("New · deadlineprazoReview tomorrow");
    expect(screen.getByRole("button", { name: "Mastered · 1" })).toBeInTheDocument();
  });

  it("keeps the mistakes from before patterns on their own page", async () => {
    renderPage(loaded(), "/mistakes/types/earlier");
    expect(await screen.findByRole("heading", { name: "From before patterns" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("I hasI have");
  });

  it("offers the voice review when something is due", async () => {
    const due = { due: [{ subject: { kind: "pattern", id: "p-past" } }], nextDueAt: null } as unknown as ReviewOverview;
    const router = renderPage({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue(due) });

    expect(await screen.findByRole("region", { name: "1 item to review today" })).toHaveTextContent("By voice · about 3 min");
    await userEvent.click(screen.getByRole("link", { name: "Start review" }));
    expect(router.state.location.pathname).toBe("/review");
  });

  it("opens a pattern with its rule and the learner's sentences, to practice it, and goes back to its type", async () => {
    const router = renderPage(loaded(), "/mistakes/types/verb_tense");
    await userEvent.click(await screen.findByRole("link", { name: /Past for finished actions/ }));

    expect(router.state.location.pathname).toBe("/mistakes/patterns/p-past");
    expect(screen.getByRole("heading", { name: "Past for finished actions" })).toHaveFocus();
    expect(screen.getByText("Ação que já terminou: verbo no passado.")).toBeInTheDocument();
    expect(screen.getByText("5 times")).toBeInTheDocument();
    const sentences = within(screen.getByRole("region", { name: "Your sentences" })).getAllByRole("listitem");
    expect(sentences.map((s) => s.textContent)).toEqual([
      "I finish it yesterdayI finished it yesterday.Not a mistake?",
      "Last week we goLast week we went.Not a mistake?",
    ]);

    await userEvent.click(screen.getByRole("link", { name: "Practice this · 1 min" }));
    expect(router.state.location).toMatchObject({ pathname: "/review", search: "?pattern=p-past" });
    await router.navigate(-1);
    await userEvent.click(await screen.findByRole("link", { name: "Back" }));
    expect(router.state.location.pathname).toBe("/mistakes/types/verb_tense");
    expect(await screen.findByRole("heading", { name: "Verb tense" })).toBeInTheDocument();
  });

  it("says when nothing is scheduled yet", async () => {
    renderPage({ practice: vi.fn().mockResolvedValue(practice), reviewOverview: vi.fn().mockResolvedValue({ due: [], nextDueAt: null }) });
    expect(await screen.findByRole("region", { name: "Nothing to review right now" })).toHaveTextContent("Nothing scheduled yet.");
  });

  it("takes a sentence out of the bank and reloads the pattern", async () => {
    const load = vi.fn().mockResolvedValue(practice);
    const dismissMistake = vi.fn().mockResolvedValue(undefined);
    renderPage({ practice: load, reviewOverview: vi.fn().mockResolvedValue(nothingDue), dismissMistake }, "/mistakes/patterns/p-past");
    await userEvent.click((await screen.findAllByRole("button", { name: "Not a mistake?" }))[1]);
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
    expect(await screen.findByRole("region", { name: "By type" })).toBeInTheDocument();
  });
});
