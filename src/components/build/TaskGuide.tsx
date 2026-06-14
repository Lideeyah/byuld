import { C, F, R } from "../../tokens";
import type { BuildSectionDef } from "../../types";

interface Props {
  section: BuildSectionDef;
  index: number;   // 0-based
  total: number;
  persona?: "founder" | "developer";
  languages?: string[];
}

// Block copy/cut/right-click so the user can't paste the answer — they must type it.
const noCopy = {
  onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
  onCut: (e: React.ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  style: {} as React.CSSProperties,
};
const unselectable: React.CSSProperties = {
  userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none", msUserSelect: "none",
};

// The single most important element on the build screen: a plain-English,
// concrete "do this now" guide for the current section — what to type and why.
export default function TaskGuide({ section, index, total, persona = "founder", languages = [] }: Props) {
  const { guide } = section;
  const isDev = persona === "developer";
  // Developers get the technical framing; founders get the plain-English "why".
  const why = isDev ? section.developerExplanation : guide.why;
  const langNote = isDev && languages.length
    ? `You know ${languages.join(", ")} — think of an enum like a fixed set of named constants, and modifiers like middleware that runs before the function body.`
    : null;

  return (
    <div style={{ padding: "20px", background: C.surface, overflowY: "auto" }}>
      <div style={{ fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
        Step {index + 1} of {total}{isDev && languages.length ? ` · ${languages[0]} background` : ""}
      </div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>
        {section.title}
      </h2>

      {/* Why it matters */}
      <div style={{ padding: "12px 14px", background: `${C.purple}0E`, border: `1px solid ${C.purple}22`, borderRadius: R.md, marginBottom: "18px" }}>
        <div style={{ fontSize: "10px", color: C.purple, fontFamily: F.body, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px" }}>
          {isDev ? "What this does" : "Why this matters"}
        </div>
        <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55, margin: 0 }}>{why}</p>
        {langNote && (
          <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5, margin: "8px 0 0", paddingTop: "8px", borderTop: `1px solid ${C.purple}22` }}>
            {langNote}
          </p>
        )}
      </div>

      {/* Concrete steps */}
      <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
        Type this into the editor
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {guide.steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, marginTop: "1px", background: C.surface2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: F.mono, color: C.textSec }}>
              {i + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5, marginBottom: "6px" }}>{s.do}</div>
              {/* Un-copyable: you have to type it yourself */}
              <pre
                {...noCopy}
                style={{ margin: 0, padding: "10px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: R.md, fontFamily: F.mono, fontSize: "12.5px", color: C.mint, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", ...unselectable }}
              >
                {s.code}
              </pre>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5, marginTop: "16px" }}>
        Type each line yourself — you can't copy it, and that's on purpose. Typing it is how it sticks. When you're done, hit <strong style={{ color: C.textSec }}>Check my code</strong>. Stuck? Ask Byuld.
      </p>
    </div>
  );
}
