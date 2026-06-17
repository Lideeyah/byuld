import { C, F } from "../../tokens";

// P5 — lightweight progress indicator for the build → deploy flow.
// phase is 1-based across these stages.
const PHASES = ["Build", "Security", "Understand", "Deploy"];

export default function FlowProgress({ phase, compact = false }: { phase: number; compact?: boolean }) {
  const total = PHASES.length;
  const pct = Math.round((phase / total) * 100);
  return (
    <div style={{ width: "100%", maxWidth: compact ? "none" : "640px", margin: compact ? 0 : "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, fontWeight: 600, letterSpacing: "0.04em" }}>
          Step {phase} of {total} · {PHASES[phase - 1]}
        </span>
        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>{pct}%</span>
      </div>
      <div style={{ display: "flex", gap: "5px" }}>
        {PHASES.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: "4px", borderRadius: "2px",
            background: i < phase ? C.purple : C.surface2,
            transition: "background 0.3s",
          }} />
        ))}
      </div>
    </div>
  );
}
