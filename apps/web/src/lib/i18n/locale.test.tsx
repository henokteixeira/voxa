import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LOCALE_STORAGE_KEY, useCopy, useLocale } from "./locale";
import { LocaleProvider } from "./locale-provider";

const COPY = { en: { hello: "Hello" }, "pt-BR": { hello: "Olá" } };

function Probe() {
  const copy = useCopy(COPY);
  const { locale, setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale(locale === "en" ? "pt-BR" : "en")}>
      {copy.hello}
    </button>
  );
}

afterEach(() => localStorage.clear());

describe("locale", () => {
  it("uses English when there is no provider, so tests and stories stay stable", () => {
    render(<Probe />);
    expect(screen.getByRole("button")).toHaveTextContent("Hello");
  });

  it("starts in Portuguese inside the app", () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Olá");
    expect(document.documentElement.lang).toBe("pt-BR");
  });

  it("switches language, remembers it and updates the page language", async () => {
    const { unmount } = render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Hello");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");

    unmount();
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Hello");
  });

  it("ignores an unknown saved value", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "xx");
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("Olá");
  });
});
