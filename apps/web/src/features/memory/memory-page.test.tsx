import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes } from "@/app/router";
import type { ApiClient, LearnerFact } from "@/lib/api";

const job: LearnerFact = { id: "f1", topic: "work", statement: "Works at Joqum.", learnedAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z" };
const trip: LearnerFact = { id: "f2", topic: "life", statement: "Lives in Brazil.", learnedAt: "2026-11-07T10:00:00Z", updatedAt: "2026-11-07T10:00:00Z" };

function renderMemory(api: Partial<ApiClient>) {
  const router = createMemoryRouter(routes, { initialEntries: ["/memory"] });
  render(
    <ApiProvider value={api as unknown as ApiClient}>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return router;
}

describe("What Voxa knows about you", () => {
  it("lists the facts by topic", async () => {
    renderMemory({ learnerFacts: vi.fn().mockResolvedValue([trip, job]) });
    expect(await screen.findByRole("heading", { name: "What Voxa knows about you" })).toHaveFocus();
    const work = screen.getByRole("region", { name: "Work" });
    expect(within(work).getByText("Works at Joqum.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Life" })).getByText("Lives in Brazil.")).toBeInTheDocument();
    // Work comes first, whatever the order the facts came in.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Work", "Life"]);
  });

  it("says when there is nothing yet", async () => {
    renderMemory({ learnerFacts: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("rewrites a fact", async () => {
    const editLearnerFact = vi.fn().mockResolvedValue({ ...job, statement: "Works at JOCUM." });
    renderMemory({ learnerFacts: vi.fn().mockResolvedValue([job]), editLearnerFact });
    await userEvent.click(await screen.findByRole("button", { name: "Edit: Works at Joqum." }));
    const field = screen.getByRole("textbox", { name: "Fact" });
    await userEvent.clear(field);
    await userEvent.type(field, " Works at JOCUM. ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(editLearnerFact).toHaveBeenCalledWith("f1", "Works at JOCUM.");
    expect(await screen.findByText("Works at JOCUM.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the edit open when it could not be saved", async () => {
    renderMemory({ learnerFacts: vi.fn().mockResolvedValue([job]), editLearnerFact: vi.fn().mockRejectedValue(new Error("down")) });
    await userEvent.click(await screen.findByRole("button", { name: "Edit: Works at Joqum." }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
    expect(screen.getByRole("textbox", { name: "Fact" })).toBeInTheDocument();
  });

  it("deletes a fact only after confirming", async () => {
    const deleteLearnerFact = vi.fn().mockResolvedValue(undefined);
    renderMemory({ learnerFacts: vi.fn().mockResolvedValue([job, trip]), deleteLearnerFact });
    await userEvent.click(await screen.findByRole("button", { name: "Delete: Works at Joqum." }));
    expect(deleteLearnerFact).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete: Works at Joqum." }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteLearnerFact).toHaveBeenCalledWith("f1");
    expect(screen.queryByText("Works at Joqum.")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Work" })).not.toBeInTheDocument();
    expect(screen.getByText("Lives in Brazil.")).toBeInTheDocument();
  });

  it("offers to try again when the facts could not be loaded", async () => {
    const learnerFacts = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([job]);
    renderMemory({ learnerFacts });
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Works at Joqum.")).toBeInTheDocument();
  });
});
