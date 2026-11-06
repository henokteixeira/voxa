import { Card } from "@/components/ui/card";

export function ProgressPage() {
  return (
    <>
      <h1 className="m-0 text-title">Progress</h1>
      <Card>
        <span className="text-body-strong">Nothing to show yet</span>
        <span className="text-caption text-taupe">Your fluency signals appear after a few sessions.</span>
      </Card>
    </>
  );
}
