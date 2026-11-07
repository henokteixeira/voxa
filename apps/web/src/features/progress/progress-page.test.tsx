import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import type { ApiClient, LevelView } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { ProgressPage } from "./progress-page";

const placed: LevelView = {
  current: {
    language: "en",
    level: "A2",
    source: "placement",
    evidence: ["Yesterday I fix one bug in the upload"],
    assessedAt: "2026-11-07T10:00:00Z",
    step: "build_light",
  },
  placementDue: false,
};

function renderProgress(api: Partial<ApiClient>, wrap: (node: ReactNode) => ReactNode = (n) => n) {
  render(
    wrap(
      <ApiProvider value={api as ApiClient}>
        <MemoryRouter>
          <ProgressPage />
        </MemoryRouter>
      </ApiProvider>,
    ),
  );
}

describe("Progress", () => {
  it("says progress comes from practice, not from getting it right", async () => {
    renderProgress({ level: vi.fn().mockRejectedValue(new Error("down")) });
    expect(screen.getByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByText(/every session counts, mistakes included/)).toBeInTheDocument();
  });

  it("speaks Portuguese", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed) }, (n) => <LocaleProvider>{n}</LocaleProvider>);
    expect(screen.getByRole("heading", { name: "Progresso" })).toBeInTheDocument();
    expect(screen.getByText(/toda sessão conta, com erros e tudo/)).toBeInTheDocument();
    expect(await screen.findByText("Nível A2")).toBeInTheDocument();
    expect(screen.getByText(/não uma nota/)).toBeInTheDocument();
  });

  it("shows the level with the learner's own lines, as an estimate", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed) });
    const card = await screen.findByRole("region", { name: "Your speaking level" });
    expect(card).toHaveTextContent("Level A2");
    expect(card).toHaveTextContent("From the placement interview");
    expect(card).toHaveTextContent("“Yesterday I fix one bug in the upload”");
    expect(card).toHaveTextContent("An estimate, not a grade");
    expect(screen.getByRole("link", { name: "Do the placement again" })).toHaveAttribute("href", "/session/placement");
  });

  it("invites a placement when there is no level yet", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    expect(await screen.findByRole("link", { name: "Start the conversation" })).toHaveAttribute("href", "/session/placement");
  });

  it("lets the learner set a level by hand when there is none", async () => {
    const setLevel = vi.fn().mockResolvedValue({ ...placed, current: { ...placed.current!, source: "manual" } });
    renderProgress({ level: vi.fn().mockResolvedValue({ current: null, placementDue: true }), setLevel });
    await userEvent.click(await screen.findByRole("button", { name: "Or set it by hand" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Level" }), "A2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLevel).toHaveBeenCalledWith("A2");
    expect(await screen.findByText("Level A2")).toBeInTheDocument();
  });

  it("says when the level can't be loaded and tries again", async () => {
    const level = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(placed);
    renderProgress({ level });
    expect(await screen.findByText("Couldn't load your level")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Level A2")).toBeInTheDocument();
  });

  it("says when a new placement is due", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue({ ...placed, placementDue: true }) });
    expect(await screen.findByText(/It's been 4 weeks/)).toBeInTheDocument();
  });

  it("lets the learner adjust the level by hand", async () => {
    const setLevel = vi.fn().mockResolvedValue({
      ...placed,
      current: { ...placed.current!, level: "B1", source: "manual", evidence: [] },
    });
    renderProgress({ level: vi.fn().mockResolvedValue(placed), setLevel });
    await userEvent.click(await screen.findByRole("button", { name: "Adjust the level" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Level" }), "B1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLevel).toHaveBeenCalledWith("B1");
    expect(await screen.findByText("Level B1")).toBeInTheDocument();
    expect(screen.getByText(/Set by you/)).toBeInTheDocument();
  });

  it("says when the level could not be saved", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed), setLevel: vi.fn().mockRejectedValue(new Error("down")) });
    await userEvent.click(await screen.findByRole("button", { name: "Adjust the level" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
  });
});
