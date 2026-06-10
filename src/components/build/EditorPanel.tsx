import { C, F, R } from "../../tokens";
import { useApp } from "../../context/AppContext";
import MonacoEditor from "@monaco-editor/react";

interface Props {
  onCodeChange?: (code: string) => void;
  onLineClick?: (line: string, lineNumber: number) => void;
  readOnlyCode?: string | null;   // when viewing a completed section
  readOnlyTitle?: string | null;
  onCloseReadOnly?: () => void;
}

export default function EditorPanel({ onCodeChange, onLineClick, readOnlyCode, readOnlyTitle, onCloseReadOnly }: Props) {
  const { state, dispatch } = useApp();
  const currentSec = state.sections[state.currentSection];
  const viewingReadOnly = readOnlyCode != null;

  const handleChange = (value: string | undefined) => {
    if (viewingReadOnly) return;
    const code = value ?? "";
    if (currentSec) dispatch({ type: "UPDATE_SECTION_CODE", id: currentSec.id, code });
    onCodeChange?.(code);
  };

  const value = viewingReadOnly ? readOnlyCode! : (currentSec?.code ?? "");
  const headerLabel = viewingReadOnly ? readOnlyTitle : currentSec?.title;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}>
      {/* Editor header */}
      <div style={{
        padding: "8px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface,
        display: "flex", alignItems: "center", gap: "12px", flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["#FF5F57", "#FFBD2E", "#28C840"].map((c, i) => (
            <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono, letterSpacing: "0.06em" }}>
          Escrow.sol
        </span>
        <div style={{ flex: 1 }} />
        {viewingReadOnly ? (
          <button onClick={onCloseReadOnly} style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, background: "none", border: `1px solid ${C.border}`, borderRadius: R.full, padding: "2px 10px", cursor: "pointer" }}>
            ✕ Viewing {headerLabel} — back to writing
          </button>
        ) : headerLabel ? (
          <span style={{ fontSize: "11px", color: C.purple, fontFamily: F.body, fontWeight: 600, padding: "2px 8px", background: `${C.purple}15`, borderRadius: R.full }}>
            ✎ {headerLabel}
          </span>
        ) : null}
      </div>

      {/* Monaco */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          height="100%"
          language="sol"
          path={viewingReadOnly ? "readonly.sol" : `section-${currentSec?.id ?? "x"}.sol`}
          value={value}
          onChange={handleChange}
          onMount={(editor) => {
            editor.onMouseDown((e: any) => {
              if (e.target?.position && onLineClick && !viewingReadOnly) {
                const lineNumber = e.target.position.lineNumber;
                const lineContent = editor.getModel()?.getLineContent(lineNumber) ?? "";
                if (lineContent.trim()) onLineClick(lineContent, lineNumber);
              }
            });
          }}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: "line",
            lineNumbers: "on",
            glyphMargin: false,
            folding: false,
            wordWrap: "on",
            tabSize: 4,
            automaticLayout: true,
            readOnly: viewingReadOnly,
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
          }}
          beforeMount={(monaco) => {
            if (!monaco.languages.getLanguages().some((l: any) => l.id === "sol")) {
              monaco.languages.register({ id: "sol" });
              monaco.languages.setMonarchTokensProvider("sol", {
                keywords: ["contract","function","modifier","enum","address","uint256","public","payable","require","return","returns","memory","storage","constructor","msg","state","if","else","mapping","bool","emit","event","pragma","solidity"],
                tokenizer: {
                  root: [
                    [/\/\/.*$/, "comment"],
                    [/"[^"]*"/, "string"],
                    [/\b\d+\b/, "number"],
                    [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@default": "identifier" } }],
                  ],
                },
              });
            }
            monaco.editor.defineTheme("byuld-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment", foreground: "5A6580", fontStyle: "italic" },
                { token: "keyword", foreground: "7B5CF0" },
                { token: "string",  foreground: "00D4AA" },
                { token: "number",  foreground: "F5A623" },
              ],
              colors: {
                "editor.background": "#0E1628",
                "editor.foreground": "#C5CDE0",
                "editor.lineHighlightBackground": "#111B33",
                "editorLineNumber.foreground": "#1E2D4A",
                "editorLineNumber.activeForeground": "#5A6580",
                "editor.selectionBackground": "#7B5CF033",
                "editorCursor.foreground": "#7B5CF0",
              },
            });
          }}
          onValidate={() => {}}
          theme="byuld-dark"
        />
      </div>
    </div>
  );
}
