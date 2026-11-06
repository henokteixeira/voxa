import { Card } from "@/components/ui/card";

export function MistakesPage() {
  return (
    <>
      <h1 className="m-0 text-title">Mistakes</h1>
      <Card>
        <span className="text-body-strong">No mistakes yet</span>
        <span className="text-caption text-taupe">
          After your first session, the mistakes worth practicing show up here.
        </span>
      </Card>
    </>
  );
}
