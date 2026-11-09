import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BackIcon, IconButton } from "@/features/session/session-parts";
import { useApi } from "@/hooks/use-api";
import { ApiError, FACT_TOPICS, type LearnerFact } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { MEMORY_COPY } from "./memory-copy";

export const MEMORY_PATH = "/memory";

/** Longest fact the server keeps. */
const MAX_FACT_LENGTH = 200;

/** "What Voxa knows about you": every fact the tutor remembers, grouped by topic, to change or delete. */
export function MemoryPage() {
  const api = useApi();
  const copy = useCopy(MEMORY_COPY);
  const navigate = useNavigate();
  // undefined: loading; null: could not load.
  const [facts, setFacts] = useState<LearnerFact[] | null | undefined>(undefined);
  const title = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    api
      .learnerFacts()
      .then(setFacts)
      .catch((error: unknown) => {
        console.warn("Could not load what Voxa knows about the learner.", error);
        setFacts(null);
      });
  }, [api]);
  useEffect(load, [load]);
  const retry = () => {
    setFacts(undefined);
    load();
  };

  // A pushed screen: its title takes the focus once it shows, so it is announced.
  const ready = facts !== undefined;
  useEffect(() => {
    if (ready) title.current?.focus();
  }, [ready]);

  const replace = (fact: LearnerFact) => setFacts((all) => all?.map((f) => (f.id === fact.id ? fact : f)));
  const drop = (id: string) => {
    setFacts((all) => all?.filter((f) => f.id !== id));
    // The row and its focused button are gone: the title keeps the learner's place.
    title.current?.focus();
  };

  return (
    <div className="vx-page-in flex flex-col gap-5">
      <div className="flex min-h-11 items-center">
        <IconButton label={copy.back} onClick={() => navigate("/", { state: { settings: true } })}>
          <BackIcon />
        </IconButton>
      </div>
      {!ready && (
        <p role="status" className="m-0 text-caption text-taupe">
          {copy.loading}
        </p>
      )}
      {ready && (
        <>
          <h1 ref={title} tabIndex={-1} className="m-0 text-title outline-none">
            {copy.title}
          </h1>
          <p className="m-0 text-caption text-taupe">{copy.intro}</p>
        </>
      )}
      {facts === null && (
        <Card>
          <p role="alert" className="m-0 text-body">
            {copy.loadFailed}
          </p>
          <Button variant="secondary" onClick={retry}>
            {copy.retry}
          </Button>
        </Card>
      )}
      {facts?.length === 0 && (
        <Card>
          <p className="m-0 text-body">{copy.empty}</p>
        </Card>
      )}
      {facts &&
        FACT_TOPICS.map((topic) => {
          const inTopic = facts.filter((f) => f.topic === topic);
          if (!inTopic.length) return null;
          return (
            <section key={topic} aria-labelledby={`topic-${topic}`}>
              <Card className="gap-0 py-2">
                <h2 id={`topic-${topic}`} className="m-0 py-2 text-label text-sage-ink">
                  {copy.topics[topic]}
                </h2>
                <ul className="m-0 flex list-none flex-col p-0">
                  {inTopic.map((fact) => (
                    <FactRow key={fact.id} fact={fact} onSaved={replace} onDeleted={drop} />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
    </div>
  );
}

function FactRow({
  fact,
  onSaved,
  onDeleted,
}: {
  fact: LearnerFact;
  onSaved: (fact: LearnerFact) => void;
  onDeleted: (id: string) => void;
}) {
  const api = useApi();
  const copy = useCopy(MEMORY_COPY);
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState(fact.statement);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"save" | "remove" | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  // Switching mode unmounts the focused button: focus goes to the new one (not on the first render).
  const switched = useRef(false);
  useLayoutEffect(() => {
    if (!switched.current) {
      switched.current = true;
      return;
    }
    if (mode === "view") editButton.current?.focus();
    if (mode === "confirm") confirmButton.current?.focus();
  }, [mode]);

  const save = async () => {
    const statement = draft.trim();
    if (!statement || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await api.editLearnerFact(fact.id, statement));
      setMode("view");
    } catch (error) {
      // Deleted elsewhere: trying again could never work.
      if (error instanceof ApiError && error.kind === "not_found") return onDeleted(fact.id);
      console.warn("Could not save the learner fact.", error);
      setProblem("save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.deleteLearnerFact(fact.id);
      onDeleted(fact.id);
    } catch (error) {
      if (error instanceof ApiError && error.kind === "not_found") return onDeleted(fact.id);
      console.warn("Could not delete the learner fact.", error);
      setProblem("remove");
      setBusy(false);
    }
  };

  const small = "min-h-11 px-3 text-[15px]";
  return (
    <li className="flex flex-col gap-2 border-t border-sand-soft py-3 first:border-t-0">
      {mode === "edit" ? (
        <>
          <label className="sr-only" htmlFor={`fact-${fact.id}`}>
            {copy.editLabel}
          </label>
          <textarea
            id={`fact-${fact.id}`}
            lang="en"
            value={draft}
            maxLength={MAX_FACT_LENGTH}
            rows={2}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-none rounded-md bg-linen p-3 font-sans text-body text-ink outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)]"
          />
          <div className="flex gap-2">
            <Button className={small} disabled={!draft.trim() || busy} onClick={() => void save()}>
              {copy.save}
            </Button>
            <Button
              variant="ghost"
              className={small}
              onClick={() => {
                setDraft(fact.statement);
                setProblem(null);
                setMode("view");
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p lang="en" className="m-0 text-body">
            {fact.statement}
          </p>
          {mode === "confirm" ? (
            <div role="group" aria-label={copy.confirmRemove} className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-taupe">{copy.confirmRemove}</span>
              <Button ref={confirmButton} variant="secondary" className={small} disabled={busy} onClick={() => void remove()}>
                {copy.remove}
              </Button>
              <Button variant="ghost" className={small} onClick={() => setMode("view")}>
                {copy.keep}
              </Button>
            </div>
          ) : (
            <div className="-mx-3 -my-2 flex gap-1">
              <Button ref={editButton} variant="ghost" className={small} aria-label={`${copy.edit}: ${fact.statement}`} onClick={() => setMode("edit")}>
                {copy.edit}
              </Button>
              <Button variant="ghost" className={small} aria-label={`${copy.remove}: ${fact.statement}`} onClick={() => setMode("confirm")}>
                {copy.remove}
              </Button>
            </div>
          )}
        </>
      )}
      {problem && (
        <p role="alert" className="m-0 text-caption text-honey-ink">
          {problem === "save" ? copy.saveFailed : copy.removeFailed}
        </p>
      )}
    </li>
  );
}
