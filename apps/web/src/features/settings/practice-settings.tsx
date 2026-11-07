import { useEffect, useState } from "react";
import { SegmentedSetting } from "@/components/ui/segmented";
import { useApi } from "@/hooks/use-api";
import { DAILY_MINUTES, type DailyMinutes } from "@/lib/api";
import { useCopy } from "@/lib/i18n/locale";
import { useSounds } from "@/lib/sound/sounds";
import { SETTINGS_COPY } from "./settings-copy";

/** How long the learner wants to practice a day. Stored on the server: the daily XP goal follows from it. */
export function DailyGoalSetting() {
  const api = useApi();
  const copy = useCopy(SETTINGS_COPY);
  const [minutes, setMinutes] = useState<DailyMinutes | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<"load" | "save" | null>(null);

  useEffect(() => {
    let active = true;
    api
      .todayProgress()
      .then((today) => active && setMinutes(today.minutesPerDay))
      .catch(() => active && setProblem("load"));
    return () => {
      active = false;
    };
  }, [api]);

  const choose = async (next: DailyMinutes) => {
    // One save at a time. The buttons stay enabled, so focus stays where the learner is.
    if (saving) return;
    const before = minutes;
    setMinutes(next);
    setSaving(true);
    setProblem(null);
    try {
      const today = await api.setDailyMinutes(next);
      setMinutes(today.minutesPerDay);
    } catch {
      setMinutes(before);
      setProblem("save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <SegmentedSetting
        title={copy.dailyTitle}
        hint={copy.dailyHint}
        options={DAILY_MINUTES.map((m) => ({ value: m, label: copy.minutes(m) }))}
        value={minutes}
        onChange={(m) => void choose(m)}
      />
      {problem && (
        <p role="alert" className="m-0 text-caption text-honey-ink">
          {problem === "load" ? copy.dailyLoadFailed : copy.dailyFailed}
        </p>
      )}
    </div>
  );
}

/** Whether the app plays its sounds, on this device. */
export function SoundSetting() {
  const copy = useCopy(SETTINGS_COPY);
  const { enabled, setEnabled } = useSounds();
  return (
    <SegmentedSetting
      title={copy.soundsTitle}
      hint={copy.soundsHint}
      options={[
        { value: true, label: copy.on },
        { value: false, label: copy.off },
      ]}
      value={enabled}
      onChange={setEnabled}
    />
  );
}
