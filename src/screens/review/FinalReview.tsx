import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import SecurityAlert from "../../components/ui/SecurityAlert";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";
import { getDemo } from "../../lib/demo";
import { assembleContract } from "../../lib/assemble";
import FlowProgress from "../../components/ui/FlowProgress";
import { ShieldCheck, ShieldAlert, AlertTriangle, Check, CheckCircle2 } from "lucide-react";
import type { SecurityIssue } from "../../types";
import Logo from "../../components/layout/Logo";

type ReviewPhase = "scanning-slither" | "scanning-ai" | "done";

// Local static pattern check — instant, runs before the AI review.
function patternCheck(code: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  if (code.includes(".call(") && !code.includes("nonReentrant")) {
    issues.push({
      id: "reentrancy-001", level: "critical", name: "Reentrancy Vulnerability",
      explanation: "Your code sends ETH using .call() without reentrancy protection. An attacker can call this function again before it finishes, draining the contract.",
      historicalExample: "The 2016 DAO hack used exactly this pattern to drain $60 million in ETH.",
      fix: "Update state variables before making external calls (Checks-Effects-Interactions).",
      acknowledged: false,
    });
  }
  const hasTransfer = code.includes("transfer(");
  const hasGuard = code.includes("onlyBuyer") || code.includes("onlyArbiter") || code.includes("onlyOwner");
  if (hasTransfer && !hasGuard) {
    issues.push({
      id: "access-001", level: "critical", name: "Missing Access Control",
      explanation: "A function that moves funds has no access control — anyone could call it.",
      historicalExample: "Multiple contracts have been drained because payout functions had no caller checks.",
      fix: "Add an access modifier (onlyBuyer / onlyArbiter) to any function that transfers funds.",
      acknowledged: false,
    });
  }
  return issues;
}

export default function FinalReview() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [phase, setPhase] = useState<ReviewPhase>("scanning-slither");
  const [issues, setIssues] = useState<SecurityIssue[]>([]);

  useEffect(() => {
    const run = async () => {
      const assembled = assembleContract(state.sections, state.buildPlan);

      // Phase 1 — local static pattern check
      await sleep(1500);
      const patternIssues = patternCheck(assembled);
      setPhase("scanning-ai");

      // Phase 2 — real Claude contextual review
      let aiIssues: SecurityIssue[] = [];
      try {
        const res = await fetch("/api/security-review", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullCode: assembled, goal: state.goal, persona: state.persona ?? "founder" }),
        });
        if (res.ok) {
          const data = await res.json();
          aiIssues = (data.issues ?? []).map((it: any, i: number) => ({
            id: `ai-${i}`,
            level: it.severity === "critical" ? "critical" : "warning",
            name: it.title,
            explanation: it.explanation,
            historicalExample: it.historicalExample,
            fix: it.fix,
            acknowledged: false,
          }));
        }
      } catch { /* fall back to pattern issues only */ }

      // Merge + de-duplicate by name
      const merged: SecurityIssue[] = [];
      for (const it of [...patternIssues, ...aiIssues]) {
        if (!merged.some(m => m.name.toLowerCase() === it.name.toLowerCase())) merged.push(it);
      }
      setPhase("done");
      setIssues(merged);
      dispatch({ type: "SET_SECURITY_ISSUES", issues: merged });
    };
    run();
  }, []);

  const criticals = issues.filter(i => i.level === "critical");
  const warnings  = issues.filter(i => i.level === "warning");
  const allAcked  = warnings.every(i => i.acknowledged) && criticals.length === 0;
  const [localAck, setLocalAck] = useState<Set<string>>(new Set());

  const ack = (id: string) => {
    setLocalAck(prev => new Set([...prev, id]));
    dispatch({ type: "ACKNOWLEDGE_ISSUE", id });
  };

  const allResolved = phase === "done" && criticals.length === 0 && warnings.every(i => localAck.has(i.id));

  // Demo autopilot: once the scan is clean, continue to the comprehension gate.
  useEffect(() => {
    if (!getDemo() || phase !== "done") return;
    // acknowledge any warnings so the gate is unblocked, then continue
    warnings.forEach(w => { if (!localAck.has(w.id)) ack(w.id); });
    if (criticals.length === 0) {
      const t = setTimeout(() => navigate("/comprehension"), 3500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, issues]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Top */}
      <div style={{ padding: "16px 32px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "16px" }}>
        <Logo size="sm" />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>Final Security Review</span>
      </div>

      <div style={{ padding: "16px 20px 0", maxWidth: "640px", margin: "0 auto", width: "100%" }}>
        <FlowProgress phase={2} compact />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 60px", maxWidth: "640px", margin: "0 auto", width: "100%" }}>
        {/* Scanning states */}
        {phase !== "done" && (
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: `${C.purple}18`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: C.purple }}>
                <ShieldCheck size={28} />
              </div>
              <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>
                Your contract is written. Well done.
              </h2>
              <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>Running final checks now.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "360px", margin: "0 auto" }}>
              {[
                { label: "Running Slither security scan…", active: phase === "scanning-slither", done: phase !== "scanning-slither" },
                { label: "Running AI contextual review…",  active: phase === "scanning-ai",     done: false },
              ].map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
                  {step.done
                    ? <Check size={14} color={C.mint} />
                    : step.active
                    ? <Spinner size={14} />
                    : <div style={{ width: "14px", height: "14px", borderRadius: "50%", border: `2px solid ${C.border}` }} />
                  }
                  <span style={{ fontSize: "13px", color: step.active ? C.white : step.done ? C.mint : C.textMute, fontFamily: F.body }}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {phase === "done" && (
          <div style={{ width: "100%" }} className="fade-in">
            {/* Summary */}
            <div style={{
              padding: "20px 24px", marginBottom: "24px",
              background: criticals.length > 0 ? "rgba(255,90,90,0.08)" : warnings.length > 0 ? "rgba(245,166,35,0.08)" : "rgba(0,212,170,0.08)",
              border: `1px solid ${criticals.length > 0 ? C.danger : warnings.length > 0 ? C.warn : C.mint}33`,
              borderLeft: `3px solid ${criticals.length > 0 ? C.danger : warnings.length > 0 ? C.warn : C.mint}`,
              borderRadius: R.lg,
              display: "flex", alignItems: "center", gap: "16px",
            }}>
              <span style={{ display: "flex", flexShrink: 0 }}>{criticals.length > 0 ? <ShieldAlert size={26} color={C.danger} /> : warnings.length > 0 ? <AlertTriangle size={26} color={C.warn} /> : <ShieldCheck size={26} color={C.mint} />}</span>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: C.white, fontFamily: F.body, marginBottom: "3px" }}>
                  {criticals.length > 0
                    ? `${criticals.length} critical issue${criticals.length > 1 ? "s" : ""} found — must fix`
                    : warnings.length > 0
                    ? `${warnings.length} warning${warnings.length > 1 ? "s" : ""} — review and acknowledge`
                    : "No issues found. Contract is clean."}
                </div>
                <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
                  Slither + AI review · {issues.length} findings
                </div>
              </div>
            </div>

            {/* Issues */}
            {issues.map(issue => (
              <div key={issue.id} style={{ marginBottom: "10px" }}>
                <SecurityAlert
                  level={issue.level === "critical" ? "danger" : issue.level === "warning" ? "warn" : "info"}
                  title={issue.name}
                  body={
                    <div>
                      <div style={{ marginBottom: "8px" }}>{issue.explanation}</div>
                      <div style={{ fontFamily: F.mono, fontSize: "11px", color: C.mint, padding: "6px 10px", background: `${C.mint}0A`, borderRadius: "4px" }}>
                        Fix: {issue.fix}
                      </div>
                      {!localAck.has(issue.id) && issue.level !== "critical" && (
                        <button
                          onClick={() => ack(issue.id)}
                          style={{
                            marginTop: "10px", padding: "5px 12px",
                            background: "none", border: `1px solid ${C.warn}44`,
                            borderRadius: R.md, color: C.warn, fontFamily: F.body, fontSize: "12px", cursor: "pointer",
                          }}
                        >
                          I understand this risk
                        </button>
                      )}
                      {localAck.has(issue.id) && (
                        <div style={{ marginTop: "8px", fontSize: "11px", color: C.mint, display: "flex", alignItems: "center", gap: "4px" }}><Check size={12} /> Acknowledged</div>
                      )}
                    </div>
                  }
                />
              </div>
            ))}

            {/* No issues */}
            {issues.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}><CheckCircle2 size={44} color={C.mint} /></div>
                <div style={{ fontSize: "16px", fontWeight: 600, color: C.mint, fontFamily: F.body }}>Contract is clean. Ready for deployment.</div>
              </div>
            )}

            <div style={{ marginTop: "28px" }}>
              <Button
                fullWidth size="lg"
                variant={allResolved ? "mint" : "ghost"}
                disabled={!allResolved}
                onClick={() => navigate("/comprehension")}
              >
                {allResolved ? "Continue to comprehension check →" : criticals.length > 0 ? "Fix critical issues to continue" : "Acknowledge all warnings to continue"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
