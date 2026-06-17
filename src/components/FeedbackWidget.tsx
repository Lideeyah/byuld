import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { C, F, R } from "../tokens";
import Button from "./ui/Button";
import { useApp } from "../context/AppContext";

// P8 — always-available feedback. A small floating button that opens a lightweight
// modal so users can report problems even if they never finish the flow.
// Hidden on the marketing/auth/admin/demo-start surfaces.
const HIDE_ON = ["/", "/auth", "/check-email", "/admin", "/demo"];

const textarea: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: R.md, color: C.white, fontFamily: F.body, fontSize: "13px", outline: "none",
  boxSizing: "border-box", resize: "vertical", minHeight: "52px",
};
const label: React.CSSProperties = { fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 600, display: "block", marginBottom: "5px" };

export default function FeedbackWidget() {
  const location = useLocation();
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState("");
  const [confused, setConfused] = useState("");
  const [improve, setImprove] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (HIDE_ON.includes(location.pathname)) return null;

  const close = () => { setOpen(false); setTimeout(() => { setDone(false); setIssue(""); setConfused(""); setImprove(""); }, 200); };

  const submit = async () => {
    if (submitting || (!issue.trim() && !confused.trim() && !improve.trim())) return;
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "quick", email: state.email, experienceLevel: state.experienceLevel, contractType: state.contractType, issue, confused, improve }),
      });
    } catch { /* best effort */ }
    setSubmitting(false);
    setDone(true);
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} style={{
          position: "fixed", bottom: "20px", right: "20px", zIndex: 9000,
          padding: "9px 16px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: R.full, color: C.textSec, fontFamily: F.body, fontSize: "13px", fontWeight: 600,
          cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,0.35)", display: "flex", alignItems: "center", gap: "7px",
        }}>
          <span style={{ color: C.purple }}>✦</span> Feedback
        </button>
      )}

      {open && (
        <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9001, width: "320px", maxWidth: "calc(100vw - 40px)",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 16px 44px rgba(0,0,0,0.5)", padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: C.white, fontFamily: F.display }}>Share feedback</span>
            <button onClick={close} aria-label="Close" style={{ background: "none", border: "none", color: C.textMute, fontSize: "16px", cursor: "pointer" }}>✕</button>
          </div>

          {done ? (
            <div style={{ textAlign: "center", padding: "10px 4px 6px" }}>
              <div style={{ color: C.mint, fontSize: "22px", marginBottom: "8px" }}>✓</div>
              <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, marginBottom: "16px", lineHeight: 1.5 }}>Thanks — this goes straight to the team.</p>
              <Button fullWidth size="sm" onClick={close}>Done</Button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div><label style={label}>What issue did you encounter?</label><textarea style={textarea} value={issue} onChange={e => setIssue(e.target.value)} /></div>
              <div><label style={label}>What confused you?</label><textarea style={textarea} value={confused} onChange={e => setConfused(e.target.value)} /></div>
              <div><label style={label}>What would you improve?</label><textarea style={textarea} value={improve} onChange={e => setImprove(e.target.value)} /></div>
              <Button fullWidth size="sm" onClick={submit} disabled={submitting}>{submitting ? "Sending…" : "Send feedback"}</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
