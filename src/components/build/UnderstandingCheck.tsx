import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { C, F, R } from "../../tokens";
import { trackUnderstanding } from "../../lib/analytics";

// A single, quiet check under the task explanation. Surfaces confusing concepts
// (the "explain simpler" rate) without nagging — one row, dismisses on answer.
export default function UnderstandingCheck({ concept, onSimpler }: { concept: string; onSimpler: () => void }) {
  const [done, setDone] = useState(false);

  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px",
    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.full,
    color: C.textSec, fontFamily: F.body, fontSize: "12px", cursor: "pointer",
  };

  return (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      {done ? (
        <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>Thanks — keep going. 👍</span>
      ) : (
        <>
          <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, fontWeight: 600 }}>Make sense?</span>
          <button style={pill} onClick={() => { trackUnderstanding(concept, "makes_sense"); setDone(true); }}>
            <ThumbsUp size={12} /> Yes
          </button>
          <button style={pill} onClick={() => { trackUnderstanding(concept, "simpler"); onSimpler(); }}>
            Explain simpler
          </button>
        </>
      )}
    </div>
  );
}
