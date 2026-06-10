import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";

const BROKEN = `// One of these lines is in the wrong order.
function release() public onlyBuyer inState(State.Locked) {
    payable(seller).transfer(amount);   // money is sent here
    state = State.Released;             // state is updated here
}`;

const OPTIONS = [
  { id: "A", text: "The function should be called 'pay' not 'release'" },
  { id: "B", text: "ETH is sent BEFORE the state is updated — this allows reentrancy attacks", correct: true },
  { id: "C", text: "The onlyBuyer modifier is wrong — the arbiter should release funds" },
  { id: "D", text: "The amount variable should be set to zero before transfer" },
];

export default function Comprehension() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);

  const choose = (id: string) => {
    setPicked(id);
    const isCorrect = OPTIONS.find((o) => o.id === id)?.correct === true;
    setResult(isCorrect ? "correct" : "wrong");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: "720px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px", marginBottom: "8px" }}>
            One final check before you deploy.
          </h1>
          <p style={{ fontSize: "15px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            Find the bug. Prove you understood what you built.
          </p>
        </div>

        <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.7, marginBottom: "16px" }}>
          Below is a version of your escrow contract with one deliberate mistake. This exact type of mistake has
          caused millions in losses in real contracts. Find it to unlock deployment.
        </p>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: R.lg, overflow: "hidden", marginBottom: "24px" }}>
          <div style={{ height: "200px", background: "#0E1628" }}>
            <MonacoEditor
              height="100%"
              language="sol"
              theme="byuld-dark"
              value={BROKEN}
              options={{
                readOnly: true, fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 22, minimap: { enabled: false }, scrollBeyondLastLine: false,
                lineNumbers: "on", padding: { top: 16, bottom: 16 }, wordWrap: "on",
                folding: false, glyphMargin: false,
              }}
              beforeMount={(monaco) => {
                if (!monaco.languages.getLanguages().some((l: any) => l.id === "sol")) {
                  monaco.languages.register({ id: "sol" });
                }
                monaco.editor.defineTheme("byuld-dark", {
                  base: "vs-dark", inherit: true,
                  rules: [
                    { token: "comment", foreground: "F5A623", fontStyle: "italic" },
                    { token: "keyword", foreground: "7B5CF0" },
                  ],
                  colors: { "editor.background": "#0E1628", "editor.foreground": "#C5CDE0", "editorLineNumber.foreground": "#1E2D4A" },
                });
              }}
            />
          </div>
        </div>

        <h3 style={{ fontSize: "16px", fontWeight: 600, fontFamily: F.body, color: C.white, marginBottom: "14px" }}>
          What is wrong with this code?
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          {OPTIONS.map((opt) => {
            const isPicked = picked === opt.id;
            const showCorrect = result && opt.correct;
            const showWrong = isPicked && result === "wrong";
            const border = showCorrect ? C.mint : showWrong ? C.danger : isPicked ? C.purple : C.border;
            return (
              <button
                key={opt.id}
                onClick={() => result !== "correct" && choose(opt.id)}
                disabled={result === "correct"}
                style={{
                  display: "flex", alignItems: "center", gap: "14px", textAlign: "left",
                  padding: "16px 18px", background: isPicked ? `${border}12` : C.surface,
                  border: `1px solid ${border}`, borderRadius: R.lg,
                  cursor: result === "correct" ? "default" : "pointer", transition: "all 0.15s",
                }}
              >
                <span style={{
                  width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
                  background: showCorrect ? C.mint : showWrong ? C.danger : C.surface2,
                  border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "12px", fontWeight: 700, fontFamily: F.display,
                  color: showCorrect || showWrong ? C.bg : C.textMute,
                }}>
                  {showCorrect ? "✓" : showWrong ? "✕" : opt.id}
                </span>
                <span style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5 }}>{opt.text}</span>
              </button>
            );
          })}
        </div>

        {result === "correct" && (
          <div style={{ padding: "16px 20px", background: `${C.mint}10`, border: `1px solid ${C.mint}44`, borderRadius: R.lg, marginBottom: "20px" }}>
            <p style={{ fontSize: "14px", color: C.mint, fontFamily: F.body, lineHeight: 1.6, margin: 0 }}>
              ✓ Correct. This is the Checks-Effects-Interactions pattern — state must update before ETH moves. You understand what you built.
            </p>
          </div>
        )}
        {result === "wrong" && (
          <div style={{ padding: "16px 20px", background: `${C.warn}10`, border: `1px solid ${C.warn}44`, borderRadius: R.lg, marginBottom: "20px" }}>
            <p style={{ fontSize: "14px", color: C.warn, fontFamily: F.body, lineHeight: 1.6, margin: 0 }}>
              Not quite. Look at the order of operations — what happens to the contract state before and after the money moves? Try again.
            </p>
          </div>
        )}

        <Button fullWidth size="lg" disabled={result !== "correct"} onClick={() => navigate("/deploy")}>
          {result === "correct" ? "Unlock deployment →" : "Find the bug to continue"}
        </Button>
      </div>
    </div>
  );
}
