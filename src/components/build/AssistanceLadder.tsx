import { Lightbulb, BookOpen, Sparkles, Eye } from "lucide-react";
import { C, F, R } from "../../tokens";

// Progressive help — appears only after a failed attempt and unlocks one rung at a
// time, so the user always tries first. Quiet by design: a single row, not a panel.
//   attempt 1  → "keep trying" nudge
//   attempt 2  → Need a hint?
//   attempt 3  → Explain again · Show example
//   attempt 4+ → Reveal solution
export default function AssistanceLadder({
  attempts, busy, onHint, onExplain, onExample, onReveal,
}: {
  attempts: number; busy: boolean;
  onHint: () => void; onExplain: () => void; onExample: () => void; onReveal: () => void;
}) {
  if (attempts < 1) return null;

  const Pill = ({ Icon, label, onClick, danger }: { Icon: typeof Lightbulb; label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} disabled={busy} style={{
      display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px",
      background: danger ? "transparent" : C.surface2,
      border: `1px solid ${danger ? C.border : C.border}`,
      borderRadius: R.full, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
      color: danger ? C.textMute : C.textSec, fontFamily: F.body, fontSize: "12px", fontWeight: 500,
    }}>
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div style={{
      borderTop: `1px solid ${C.border}`, background: C.surface,
      padding: "9px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flexShrink: 0,
    }}>
      <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, fontWeight: 600 }}>Stuck?</span>
      {attempts < 2 && (
        <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
          Give it one more try — help unlocks if you're still stuck.
        </span>
      )}
      {attempts >= 2 && <Pill Icon={Lightbulb} label="Need a hint?" onClick={onHint} />}
      {attempts >= 3 && <Pill Icon={BookOpen} label="Explain again" onClick={onExplain} />}
      {attempts >= 3 && <Pill Icon={Sparkles} label="Show example" onClick={onExample} />}
      {attempts >= 4 && <Pill Icon={Eye} label="Reveal solution" onClick={onReveal} danger />}
    </div>
  );
}
