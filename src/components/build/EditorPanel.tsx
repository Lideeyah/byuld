import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { C, F, R } from "../../tokens";
import { useApp } from "../../context/AppContext";
import MonacoEditor from "@monaco-editor/react";

interface Props {
  onCodeChange?: (code: string) => void;
  onAskLine?: (question: string, line: string, lineNumber: number) => void;
  readOnlyCode?: string | null;   // when viewing a completed section
  readOnlyTitle?: string | null;
  onCloseReadOnly?: () => void;
}

const CHIPS = [
  "What does this do?",
  "Why is this here?",
  "What if I remove this?",
  "Is this safe?",
];

interface Anchor { x: number; y: number; line: string; lineNumber: number; }

// ─── Floating "?" button + popover, rendered via portal over the editor ─────────
function InlineHelp({ anchor, onAsk, onClose, onOpenChange }: {
  anchor: Anchor;
  onAsk: (question: string) => void;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onOpenChange?.(open); }, [open]);

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const ask = (q: string) => {
    const question = q.trim();
    if (!question) return;
    setOpen(false);
    onClose();
    onAsk(question);
  };

  return createPortal(
    <>
      {/* The purple ? button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: anchor.x, top: anchor.y, zIndex: 10000,
          width: "20px", height: "20px", borderRadius: "50%",
          background: C.purple, border: "none", cursor: "pointer",
          color: "#fff", fontSize: "12px", fontWeight: 700, fontFamily: F.body, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(123,92,240,0.45)", opacity: 0.9,
        }}
        aria-label="Ask about this line"
      >?</button>

      {/* Popover above the button */}
      {open && (
        <div
          ref={popRef}
          style={{
            position: "fixed", left: Math.max(12, Math.min(anchor.x - 110, window.innerWidth - 280)),
            top: anchor.y - 8, transform: "translateY(-100%)", zIndex: 10001,
            width: "264px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", padding: "12px",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
            {CHIPS.map(c => (
              <button key={c} onClick={() => ask(c)} style={{
                background: C.surface2, border: `1px solid ${C.border}`, borderRadius: "20px",
                color: C.textSec, fontFamily: F.body, fontSize: "12px", padding: "6px 12px",
                cursor: "pointer", lineHeight: 1.3, textAlign: "center", transition: "border-color 0.12s",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >{c}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") ask(text); }}
              placeholder="Ask something else…"
              autoFocus
              style={{
                flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: "8px",
                padding: "8px 10px", color: C.white, fontFamily: F.body, fontSize: "13px", outline: "none",
              }}
            />
            <button onClick={() => ask(text)} disabled={!text.trim()} style={{
              flexShrink: 0, width: "30px", height: "30px", borderRadius: "8px",
              background: text.trim() ? C.purple : C.surface2, border: "none",
              color: text.trim() ? "#fff" : C.textMute, cursor: text.trim() ? "pointer" : "default",
              fontSize: "14px", display: "flex", alignItems: "center", justifyContent: "center",
            }}>↑</button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

export default function EditorPanel({ onCodeChange, onAskLine, readOnlyCode, readOnlyTitle, onCloseReadOnly }: Props) {
  const { state, dispatch } = useApp();
  const currentSec = state.sections[state.currentSection];
  const viewingReadOnly = readOnlyCode != null;

  const editorRef = useRef<any>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLine = useRef<number>(-1);     // dedupe: only move when the LINE changes
  const pinnedRef = useRef(false);         // when the popover is open, freeze the button
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const handleChange = (value: string | undefined) => {
    if (viewingReadOnly) return;
    const code = value ?? "";
    if (currentSec) dispatch({ type: "UPDATE_SECTION_CODE", id: currentSec.id, code });
    onCodeChange?.(code);
  };

  // Pin the "?" to the RIGHT MARGIN of the hovered line — stable x for every line,
  // out of the way of the code, and it only repositions when the line changes (no jitter).
  const showAt = useCallback((lineNumber: number) => {
    if (pinnedRef.current) return;                 // popover open → don't move
    const editor = editorRef.current;
    if (!editor || viewingReadOnly) return;
    const lineContent = editor.getModel()?.getLineContent(lineNumber) ?? "";
    if (!lineContent.trim()) { return; }           // blank line → keep current, don't flicker
    if (lineNumber === lastLine.current && anchor) {
      // same line — just refresh the hide timer, don't re-render position
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => { lastLine.current = -1; setAnchor(null); }, 2500);
      return;
    }
    const node = editor.getDomNode();
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const vis = editor.getScrolledVisiblePosition({ lineNumber, column: 1 });
    if (!vis) return;
    lastLine.current = lineNumber;
    const x = rect.right - 30;                      // fixed right-margin position
    const y = rect.top + vis.top + 1;
    setAnchor({ x, y, line: lineContent, lineNumber });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { lastLine.current = -1; setAnchor(null); }, 2500);
  }, [viewingReadOnly, anchor]);

  const value = viewingReadOnly ? readOnlyCode! : (currentSec?.code ?? "");
  const headerLabel = viewingReadOnly ? readOnlyTitle : currentSec?.title;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["#FF5F57", "#FFBD2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono, letterSpacing: "0.06em" }}>Escrow.sol</span>
        <div style={{ flex: 1 }} />
        {viewingReadOnly ? (
          <button onClick={onCloseReadOnly} style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, background: "none", border: `1px solid ${C.border}`, borderRadius: R.full, padding: "2px 10px", cursor: "pointer" }}>
            ✕ Viewing {headerLabel} — back to writing
          </button>
        ) : headerLabel ? (
          <span style={{ fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 600, padding: "2px 8px", background: `${C.purple}15`, borderRadius: R.full }}>✎ {headerLabel}</span>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          height="100%"
          language="sol"
          path={viewingReadOnly ? "readonly.sol" : `section-${currentSec?.id ?? "x"}.sol`}
          value={value}
          onChange={handleChange}
          onMount={(editor) => {
            editorRef.current = editor;
            // Hover → show the floating "?" on the line's right margin (no API call).
            editor.onMouseMove((e: any) => {
              if (e.target?.position) showAt(e.target.position.lineNumber);
            });
            // Only show on selection (highlight), not on plain cursor moves while typing.
            editor.onDidChangeCursorSelection((e: any) => {
              if (!e.selection.isEmpty()) showAt(e.selection.positionLineNumber);
            });
            // Leaving the editor hides the button (unless the popover is pinned open).
            editor.onMouseLeave?.(() => {
              if (pinnedRef.current) return;
              if (hideTimer.current) clearTimeout(hideTimer.current);
              hideTimer.current = setTimeout(() => { lastLine.current = -1; setAnchor(null); }, 400);
            });
          }}
          options={{
            fontSize: 14, fontFamily: "'JetBrains Mono', monospace", lineHeight: 22,
            minimap: { enabled: false }, scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 },
            renderLineHighlight: "line", lineNumbers: "on", glyphMargin: false, folding: false,
            wordWrap: "on", tabSize: 4, automaticLayout: true, readOnly: viewingReadOnly,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            overviewRulerBorder: false, hideCursorInOverviewRuler: true,
            // Each section is an intentional fragment, so don't flag the contract's
            // closing brace (opened in a different section) as an unmatched-bracket error.
            matchBrackets: "never",
            bracketPairColorization: { enabled: false },
            guides: { bracketPairs: false, indentation: false },
          }}
          beforeMount={(monaco) => {
            if (!monaco.languages.getLanguages().some((l: any) => l.id === "sol")) {
              monaco.languages.register({ id: "sol" });
              monaco.languages.setMonarchTokensProvider("sol", {
                keywords: ["contract","function","modifier","enum","address","uint256","public","payable","require","return","returns","memory","storage","constructor","msg","state","if","else","mapping","bool","emit","event","pragma","solidity"],
                tokenizer: { root: [
                  [/\/\/.*$/, "comment"],
                  [/"[^"]*"/, "string"],
                  [/\b\d+\b/, "number"],
                  [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                ] },
              });
            }
            monaco.editor.defineTheme("byuld-dark", {
              base: "vs-dark", inherit: true,
              rules: [
                { token: "comment", foreground: "5A6580", fontStyle: "italic" },
                { token: "keyword", foreground: "7B5CF0" },
                { token: "string",  foreground: "00D4AA" },
                { token: "number",  foreground: "F5A623" },
              ],
              colors: {
                "editor.background": "#0E1628", "editor.foreground": "#C5CDE0",
                "editor.lineHighlightBackground": "#111B33", "editorLineNumber.foreground": "#1E2D4A",
                "editorLineNumber.activeForeground": "#5A6580", "editor.selectionBackground": "#7B5CF033",
                "editorCursor.foreground": "#7B5CF0",
              },
            });
          }}
          theme="byuld-dark"
        />
      </div>

      {/* Floating help — portal over the editor */}
      {anchor && onAskLine && (
        <InlineHelp
          anchor={anchor}
          onOpenChange={(open) => { pinnedRef.current = open; }}
          onClose={() => { pinnedRef.current = false; lastLine.current = -1; setAnchor(null); }}
          onAsk={(question) => onAskLine(question, anchor.line, anchor.lineNumber)}
        />
      )}
    </div>
  );
}
