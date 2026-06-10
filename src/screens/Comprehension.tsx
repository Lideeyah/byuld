import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";

const BROKEN = `function release() public onlyBuyer inState(State.Locked) {
    payable(seller).transfer(amount);
    state = State.Released;
}`;

async function post<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

// ── Small building blocks ──────────────────────────────────────────────────────

function StepHeader({ n, total, done, title }: { n: number; total: number; done: boolean; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
        background: done ? C.mint : `${C.purple}22`, border: `1px solid ${done ? C.mint : C.purple}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "13px", fontWeight: 700, fontFamily: F.display, color: done ? C.bg : C.purple,
      }}>{done ? "✓" : n}</div>
      <div>
        <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.body, letterSpacing: "0.08em", textTransform: "uppercase" }}>Part {n} of {total}</div>
        <div style={{ fontSize: "17px", fontWeight: 700, fontFamily: F.display, color: C.white }}>{title}</div>
      </div>
    </div>
  );
}

function Feedback({ kind, lines }: { kind: "pass" | "fail"; lines: string[] }) {
  const color = kind === "pass" ? C.mint : C.warn;
  return (
    <div style={{ marginTop: "12px", padding: "12px 16px", background: `${color}10`, border: `1px solid ${color}44`, borderRadius: R.md }}>
      {lines.map((l, i) => (
        <p key={i} style={{ fontSize: "13px", color, fontFamily: F.body, lineHeight: 1.6, margin: i ? "6px 0 0" : 0 }}>
          {kind === "pass" ? "✓ " : "• "}{l}
        </p>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: R.md, color: C.white, fontFamily: F.body, fontSize: "14px", outline: "none",
  boxSizing: "border-box", lineHeight: 1.5,
};

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Comprehension() {
  const navigate = useNavigate();
  const [part, setPart] = useState(1);          // current open part
  const [loading, setLoading] = useState(false);

  // Part 1
  const [summary, setSummary] = useState("");
  const [p1, setP1] = useState<{ kind: "pass" | "fail"; lines: string[] } | null>(null);

  // Part 2
  const [bugLine, setBugLine] = useState("");
  const [bugEffect, setBugEffect] = useState("");
  const [p2, setP2] = useState<{ kind: "pass" | "fail"; lines: string[] } | null>(null);

  // Part 3
  const [d1, setD1] = useState(""); const [d2, setD2] = useState(""); const [d3, setD3] = useState("");
  const [p3, setP3] = useState<{ kind: "pass" | "fail"; lines: string[] } | null>(null);

  const submitSummary = async () => {
    if (summary.trim().length < 50 || loading) return;
    setLoading(true); setP1(null);
    try {
      const r = await post<{ passed: boolean; corrections?: string[] }>("/api/validate-summary", { summary });
      if (r.passed) { setP1({ kind: "pass", lines: ["You clearly understand what your contract does."] }); setPart(2); }
      else setP1({ kind: "fail", lines: r.corrections?.length ? r.corrections : ["Try again — describe what the contract holds and when it releases."] });
    } catch { setP1({ kind: "fail", lines: ["Something went wrong. Try again."] }); }
    setLoading(false);
  };

  const submitBug = async () => {
    if (bugLine.trim().length < 20 || bugEffect.trim().length < 20 || loading) return;
    setLoading(true); setP2(null);
    try {
      const r = await post<{ passed: boolean; hint?: string }>("/api/validate-bug-explanation", { field1: bugLine, field2: bugEffect });
      if (r.passed) { setP2({ kind: "pass", lines: ["Exactly. The transfer happens before the state update — an attacker can re-enter release() and drain the contract. State must change first."] }); setPart(3); }
      else setP2({ kind: "fail", lines: [r.hint ?? "Think about what an attacker could do between the moment money is sent and the moment the contract updates its records."] });
    } catch { setP2({ kind: "fail", lines: ["Something went wrong. Try again."] }); }
    setLoading(false);
  };

  const submitDecisions = async () => {
    if (d1.trim().length < 15 || d2.trim().length < 15 || d3.trim().length < 15 || loading) return;
    setLoading(true); setP3(null);
    try {
      const r = await post<{ passed: boolean; failures?: string[] }>("/api/validate-decisions", { answers: { order: d1, access: d2, state: d3 } });
      if (r.passed) setP3({ kind: "pass", lines: ["You can defend every decision you made. You understand what you built."] });
      else setP3({ kind: "fail", lines: r.failures?.length ? r.failures : ["One of your answers needs deeper reasoning. Think about the consequence, not the rule."] });
    } catch { setP3({ kind: "fail", lines: ["Something went wrong. Try again."] }); }
    setLoading(false);
  };

  const cardWrap = (open: boolean): React.CSSProperties => ({
    padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg,
    marginBottom: "16px", opacity: open ? 1 : 0.5, pointerEvents: open ? "auto" : "none",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: "640px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px", marginBottom: "8px" }}>
            One final check before you deploy.
          </h1>
          <p style={{ fontSize: "15px", color: C.textSec, fontFamily: F.body }}>
            Prove you understand what you built. All three parts are required.
          </p>
        </div>

        {/* PART 1 — Summarise */}
        <div style={cardWrap(part >= 1)}>
          <StepHeader n={1} total={3} done={part > 1} title="What does your contract do?" />
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "12px", lineHeight: 1.6 }}>
            Explain what this contract does in your own words. Don't copy from the comments.
          </p>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} disabled={part > 1}
            placeholder="My contract…" rows={4} style={{ ...inputStyle, resize: "vertical", minHeight: "90px" }} />
          <div style={{ fontSize: "11px", color: summary.trim().length >= 50 ? C.mint : C.textMute, fontFamily: F.mono, marginTop: "6px" }}>
            {summary.trim().length} / 50 min
          </div>
          {p1 && <Feedback kind={p1.kind} lines={p1.lines} />}
          {part === 1 && (
            <div style={{ marginTop: "16px" }}>
              <Button fullWidth disabled={summary.trim().length < 50 || loading} onClick={submitSummary}>
                {loading ? <><Spinner size={14} color="#fff" /> Checking…</> : "Check my understanding →"}
              </Button>
            </div>
          )}
        </div>

        {/* PART 2 — Find the bug */}
        <div style={cardWrap(part >= 2)}>
          <StepHeader n={2} total={3} done={part > 2} title="Find and explain the bug" />
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "12px", lineHeight: 1.6 }}>
            This version of your <code style={{ fontFamily: F.mono, color: C.purple }}>release()</code> has a deliberate bug. Find it.
          </p>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: R.md, overflow: "hidden", marginBottom: "16px", height: "120px" }}>
            <MonacoEditor height="100%" language="sol" theme="byuld-dark" value={BROKEN}
              options={{ readOnly: true, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", lineHeight: 22, minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: "on", padding: { top: 12, bottom: 12 }, folding: false, glyphMargin: false }}
              beforeMount={(monaco) => {
                if (!monaco.languages.getLanguages().some((l: any) => l.id === "sol")) monaco.languages.register({ id: "sol" });
                monaco.editor.defineTheme("byuld-dark", { base: "vs-dark", inherit: true, rules: [{ token: "keyword", foreground: "7B5CF0" }], colors: { "editor.background": "#0E1628", "editor.foreground": "#C5CDE0", "editorLineNumber.foreground": "#1E2D4A" } });
              }} />
          </div>
          <label style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 500, display: "block", marginBottom: "6px" }}>Which line contains the bug? Describe it.</label>
          <input value={bugLine} onChange={e => setBugLine(e.target.value)} disabled={part > 2} placeholder="The bug is on line…" style={{ ...inputStyle, marginBottom: "14px" }} />
          <label style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 500, display: "block", marginBottom: "6px" }}>What would happen if this was deployed with the bug?</label>
          <textarea value={bugEffect} onChange={e => setBugEffect(e.target.value)} disabled={part > 2} placeholder="An attacker could…" rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: "70px" }} />
          {p2 && <Feedback kind={p2.kind} lines={p2.lines} />}
          {part === 2 && (
            <div style={{ marginTop: "16px" }}>
              <Button fullWidth disabled={bugLine.trim().length < 20 || bugEffect.trim().length < 20 || loading} onClick={submitBug}>
                {loading ? <><Spinner size={14} color="#fff" /> Checking…</> : "Submit my analysis →"}
              </Button>
            </div>
          )}
        </div>

        {/* PART 3 — Defend decisions */}
        <div style={cardWrap(part >= 3)}>
          <StepHeader n={3} total={3} done={!!p3 && p3.kind === "pass"} title="Defend your decisions" />
          {[
            { decision: "State updates before ETH is transferred in your payout functions.", label: "Why does this order matter?", val: d1, set: setD1 },
            { decision: "Only the buyer can release funds. Only the arbiter can dispute.", label: "Why can't the seller release the funds themselves?", val: d2, set: setD2 },
            { decision: "The contract has four states: Created, Locked, Released, Disputed.", label: "Why does the contract need to track its state at all?", val: d3, set: setD3 },
          ].map((c, i) => (
            <div key={i} style={{ padding: "14px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md, marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", color: C.white, fontFamily: F.body, fontWeight: 600, marginBottom: "10px" }}>“{c.decision}”</div>
              <label style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, display: "block", marginBottom: "6px" }}>{c.label}</label>
              <textarea value={c.val} onChange={e => c.set(e.target.value)} disabled={!!p3 && p3.kind === "pass"} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: "52px" }} />
            </div>
          ))}
          {p3 && <Feedback kind={p3.kind} lines={p3.lines} />}
          {part === 3 && (!p3 || p3.kind === "fail") && (
            <div style={{ marginTop: "16px" }}>
              <Button fullWidth disabled={d1.trim().length < 15 || d2.trim().length < 15 || d3.trim().length < 15 || loading} onClick={submitDecisions}>
                {loading ? <><Spinner size={14} color="#fff" /> Checking…</> : "Submit my reasoning →"}
              </Button>
            </div>
          )}
        </div>

        <Button fullWidth size="lg" variant="mint" disabled={!(p3 && p3.kind === "pass")} onClick={() => navigate("/deploy")}>
          {p3 && p3.kind === "pass" ? "Unlock deployment →" : "Complete all three parts to deploy"}
        </Button>
      </div>
    </div>
  );
}
