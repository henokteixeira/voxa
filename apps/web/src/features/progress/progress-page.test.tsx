import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { ProgressPage } from "./progress-page";

describe("Progress", () => {
  it("says progress comes from practice, not from getting it right", () => {
    render(<ProgressPage />);
    expect(screen.getByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByText(/every session counts, mistakes included/)).toBeInTheDocument();
  });

  it("speaks Portuguese", () => {
    render(
      <LocaleProvider>
        <ProgressPage />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { name: "Progresso" })).toBeInTheDocument();
    expect(screen.getByText(/toda sessão conta, com erros e tudo/)).toBeInTheDocument();
  });
});
