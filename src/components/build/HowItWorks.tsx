import { C, F, R } from "../../tokens";
import Button from "../ui/Button";

const STEPS = [
  { n: "1", title: "Read the task on the right", body: "Byuld tells you exactly what to write next, and why it matters — in plain English." },
  { n: "2", title: "Type it into the editor", body: "You write the code yourself in the middle panel. That's how you actually learn it — Byuld never writes it for you." },
  { n: "3", title: "Byuld checks your work", body: "Pause when you're done and Byuld reviews it. Get it right and the next step unlocks. Stuck? Ask in the chat." },
];

export default function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(8,14,29,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "440px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.xl, padding: "32px" }}>
        <div style={{ fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>
          How Byuld works
        </div>
        <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>
          You write the contract. We guide every line.
        </h2>
        <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, marginBottom: "24px" }}>
          No experience needed. You'll build a real escrow contract one small step at a time.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "28px" }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, background: `${C.purple}22`, border: `1px solid ${C.purple}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, fontFamily: F.display, color: C.purple }}>
                {s.n}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "2px" }}>{s.title}</div>
                <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <Button fullWidth size="lg" onClick={onClose}>Got it — let's build →</Button>
      </div>
    </div>
  );
}
