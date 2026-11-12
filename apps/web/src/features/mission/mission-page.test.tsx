import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { type VoiceDeps, VoiceDepsContext } from "@/features/session/voice-deps";
import type { ApiClient, MissionSteps, MissionView } from "@/lib/api";
import { MissionPage } from "./mission-page";
import { saveMissionTakeaways } from "./mission-steps";

// The model's clip: the test plays it to the end with `endClip()`.
let endClip: () => void = () => {};
const player = {
  load: vi.fn().mockResolvedValue(undefined),
  play: vi.fn().mockResolvedValue(true),
  pause: vi.fn(),
  unlock: vi.fn(),
  close: vi.fn(),
};
// No microphone here: the learner types.
const deps = {
  openMicrophone: vi.fn().mockRejectedValue(new Error("blocked")),
  createClipPlayer: (onEnded: () => void) => {
    endClip = onEnded;
    return player;
  },
} as unknown as VoiceDeps;

const steps = (done: Partial<MissionSteps> = {}): MissionSteps => ({
  checkIn: null,
  listen: false,
  expressions: false,
  task: false,
  faster: false,
  review: false,
  ...done,
});
const view = (done: Partial<MissionSteps> = {}, extra: Partial<MissionView> = {}): MissionView => ({
  id: "m1",
  language: "en",
  day: "2026-11-09",
  situation: "daily",
  steps: steps(done),
  done: false,
  sessionId: null,
  ...extra,
});
const expression = (id: string, phrase: string) => ({ id, position: Number(id.slice(1)), phrase, example: `${phrase} x.`, saidAt: null });
const model = {
  speaker: "Alex",
  text: "Yesterday I finished the login page. I'm still working on the tests.",
  expressions: [expression("e1", "I'm still working on…"), expression("e2", "I'm blocked by…"), expression("e3", "By the end of the day, I'll…")],
};

function renderMission(api: Partial<ApiClient>) {
  const router = createMemoryRouter(
    [
      { path: "/mission", element: <MissionPage /> },
      { path: "/", element: <p>Today tab</p> },
      { path: "/talk", element: <p>Talk tab</p> },
      { path: "/check-in", element: <p>Check-in</p> },
      { path: "/session/:mode", element: <p>Session</p> },
    ],
    { initialEntries: ["/mission"] },
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("the daily mission", () => {
  it("listens to the model, then says each expression in a sentence of the learner's own", async () => {
    const markMissionStep = vi
      .fn()
      .mockImplementation(async (_id: string, step: string) => view(step === "listen" ? { listen: true } : { listen: true, expressions: true }));
    const sayExpression = vi.fn().mockResolvedValueOnce({ used: false }).mockResolvedValue({ used: true });
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view()),
      missionModel: vi.fn().mockResolvedValue(model),
      missionSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      markMissionStep,
      sayExpression,
    });

    expect(await screen.findByRole("heading", { name: "Listen to Alex" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show the text" }));
    expect(screen.getByText(model.text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(player.play).toHaveBeenCalled();
    act(() => endClip());
    expect(markMissionStep).toHaveBeenCalledWith("m1", "listen");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "3 expressions to use" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Your sentence"), "I worked on the tests{Enter}");
    // Only whether it was used: no hint, no correction.
    expect(await screen.findByRole("alert")).toHaveTextContent("I didn't hear it in that one. Try it again.");
    await userEvent.type(screen.getByLabelText("Your sentence"), "I'm still working on the API{Enter}");
    expect(sayExpression).toHaveBeenLastCalledWith("m1", "e1", "I'm still working on the API");
    expect(await screen.findByText("That's it.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Skipping is fine.
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await userEvent.type(screen.getByLabelText("Your sentence"), "By the end of the day, I'll ship it{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(markMissionStep).toHaveBeenLastCalledWith("m1", "expressions");

    // Step 3 opens the conversation as the mission's.
    const start = await screen.findByRole("link", { name: "Start" });
    expect(start).toHaveAttribute("href", "/session/daily?mission=m1");
  });

  it("starts with the check-in on its day, and comes back to the mission after it", async () => {
    renderMission({ missionToday: vi.fn().mockResolvedValue(view({ checkIn: false })) });
    expect(await screen.findByText("Check-in · every 2 weeks")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/check-in?next=%2Fmission");
  });

  it("reviews step 3's takeaways first, then marks step 5", async () => {
    saveMissionTakeaways("m1", ["p9", "p1"]);
    const reviewCard = vi.fn().mockResolvedValue({ cardId: "c1", item: { subject: { kind: "pattern", id: "p9" }, language: "en", name: "Past" }, cue: "Eu terminei." });
    const answerReview = vi.fn().mockResolvedValue({ recalled: true, answer: "I finished.", rule: "Rule.", nextDueAt: new Date().toISOString(), xp: 1 });
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true, expressions: true, task: true, faster: true, review: true }, { done: true }));
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view({ listen: true, expressions: true, task: true, faster: true }, { sessionId: "s1" })),
      reviewOverview: vi.fn().mockResolvedValue({ due: [{ subject: { kind: "pattern", id: "p1" } }, { subject: { kind: "new_word", id: "w1" } }], nextDueAt: null }),
      reviewCard,
      answerReview,
      markMissionStep,
    });

    expect(await screen.findByText("“Eu terminei.”")).toBeInTheDocument();
    // The takeaways first, then what is due, each once.
    expect(reviewCard).toHaveBeenNthCalledWith(1, { kind: "pattern", id: "p9" });
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    for (const button of ["Next", "Next", "Finish"]) {
      await userEvent.click(await screen.findByRole("button", { name: "I don't know, show me" }));
      await userEvent.click(await screen.findByRole("button", { name: button }));
    }
    expect(reviewCard.mock.calls.map(([subject]) => subject.id)).toEqual(["p9", "p1", "w1"]);

    expect(markMissionStep).toHaveBeenCalledWith("m1", "review");
    expect(await screen.findByRole("heading", { name: "See you tomorrow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talk more" })).toHaveAttribute("href", "/talk");
  });

  it("keeps step 5 open when the review is closed before the end", async () => {
    const markMissionStep = vi.fn();
    const router = renderMission({
      missionToday: vi.fn().mockResolvedValue(view({ listen: true, expressions: true, task: true, faster: true })),
      reviewOverview: vi.fn().mockResolvedValue({ due: [{ subject: { kind: "pattern", id: "p1" } }, { subject: { kind: "pattern", id: "p2" } }], nextDueAt: null }),
      reviewCard: vi.fn().mockResolvedValue({ cardId: "c1", item: { subject: { kind: "pattern", id: "p1" }, language: "en", name: "Past" }, cue: "Eu terminei." }),
      answerReview: vi.fn().mockResolvedValue({ recalled: true, answer: "I finished.", rule: "Rule.", nextDueAt: new Date().toISOString(), xp: 1 }),
      markMissionStep,
    });
    await userEvent.click(await screen.findByRole("button", { name: "I don't know, show me" }));
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(router.state.location.pathname).toBe("/");
    expect(markMissionStep).not.toHaveBeenCalled();
  });

  it("pauses and resumes the model", async () => {
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true }));
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view()),
      missionModel: vi.fn().mockResolvedValue(model),
      missionSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      markMissionStep,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pause" }));
    expect(player.pause).toHaveBeenCalled();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(player.play).toHaveBeenCalledTimes(2);
    // Not heard to the end yet: the step isn't done.
    expect(markMissionStep).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("stops the model when the learner moves on while it plays again", async () => {
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true }));
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view()),
      missionModel: vi.fn().mockResolvedValue(model),
      missionSpeech: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      markMissionStep,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    act(() => endClip());
    await userEvent.click(await screen.findByRole("button", { name: "Listen again" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(player.pause).toHaveBeenCalled();
    expect(markMissionStep).toHaveBeenLastCalledWith("m1", "listen");
    await vi.waitFor(() => expect(player.close).toHaveBeenCalled());
  });

  it("goes on to the conversation without audio: the text is there to read", async () => {
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true }));
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view()),
      missionModel: vi.fn().mockResolvedValue(model),
      missionSpeech: vi.fn().mockRejectedValue(new Error("tts down")),
      markMissionStep,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Listen" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The audio couldn't play.");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(markMissionStep).toHaveBeenCalledWith("m1", "listen");
  });

  it("marks step 2 when all 3 were said before the learner left", async () => {
    const said = { ...model, expressions: model.expressions.map((e) => ({ ...e, saidAt: "2026-11-09T10:00:00Z" })) };
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true, expressions: true }));
    renderMission({ missionToday: vi.fn().mockResolvedValue(view({ listen: true })), missionModel: vi.fn().mockResolvedValue(said), markMissionStep });
    await vi.waitFor(() => expect(markMissionStep).toHaveBeenCalledWith("m1", "expressions"));
    expect(await screen.findByRole("link", { name: "Start" })).toHaveAttribute("href", "/session/daily?mission=m1");
  });

  it("marks step 5 at once when there is nothing to review", async () => {
    const markMissionStep = vi.fn().mockResolvedValue(view({ listen: true, expressions: true, task: true, faster: true, review: true }, { done: true }));
    renderMission({
      missionToday: vi.fn().mockResolvedValue(view({ listen: true, expressions: true, task: true, faster: true })),
      reviewOverview: vi.fn().mockResolvedValue({ due: [], nextDueAt: null }),
      markMissionStep,
    });
    expect(await screen.findByRole("heading", { name: "See you tomorrow" })).toBeInTheDocument();
    expect(markMissionStep).toHaveBeenCalledWith("m1", "review");
  });
});
