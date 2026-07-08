import { createFileRoute } from "@tanstack/react-router";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";

export const Route = createFileRoute("/test-popup")({
  component: TestPopup,
});

function TestPopup() {
  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--clay-bg)" }}>
      <WhatsNewPopup />
    </div>
  );
}
