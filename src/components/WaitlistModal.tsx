import { useEffect, useState } from "react";
import { C, F, R } from "../tokens";
import Button from "./ui/Button";

const ROLES = ["Founder", "Developer", "Student", "Designer", "Other"];

const BENEFITS = [
  "Early access to future releases",
  "Product updates",
  "Invitations to testing rounds",
  "Opportunities to give feedback and shape the product",
];

const input: React.CSSProperties = {
  width: "100%", padding: "11px 13px", background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: R.md, color: C.white, fontFamily: F.body, fontSize: "14px", outline: "none", boxSizing: "border-box",
};
const label: React.CSSProperties = { fontSize: "12px", color: C.textSec, fontFamily: F.body, fontWeight: 600, display: "block", marginBottom: "6px" };

export default function WaitlistModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [challenge, setChallenge] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const submit = async () => {
    if (submitting) return;
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Please enter a valid email."); return; }
    setSubmitting(true); setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, challenge }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); setSubmitting(false); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999, background: "rgba(4,8,18,0.72)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-in"
        style={{
          width: "100%", maxWidth: "460px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: R.lg, boxShadow: "0 24px 60px rgba(0,0,0,0.55)", padding: "28px", position: "relative",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <button onClick={onClose} aria-label="Close" style={{
          position: "absolute", top: "14px", right: "16px", background: "none", border: "none",
          color: C.textMute, fontSize: "20px", cursor: "pointer", lineHeight: 1,
        }}>✕</button>

        {!done ? (
          <>
            <div style={{ fontSize: "11px", color: C.purple, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Get early access</div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "6px" }}>Join the waitlist</h2>
            <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5, marginBottom: "20px" }}>
              Be first to build and learn with Byuld. We'll reach out as we open new rounds.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={label}>Name</label>
                <input style={input} value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Your name" autoFocus />
              </div>
              <div>
                <label style={label}>Email</label>
                <input style={input} type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} placeholder="you@example.com" />
              </div>
              <div>
                <label style={label}>Role</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {ROLES.map(r => (
                    <button key={r} onClick={() => setRole(r)} style={{
                      padding: "7px 14px", borderRadius: R.full, cursor: "pointer", fontFamily: F.body, fontSize: "13px",
                      background: role === r ? C.purple : C.surface2,
                      border: `1px solid ${role === r ? C.purple : C.border}`,
                      color: role === r ? "#fff" : C.textSec, transition: "all 0.12s",
                    }}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={label}>What's your biggest challenge when building with AI? <span style={{ color: C.textMute, fontWeight: 400 }}>(optional)</span></label>
                <textarea style={{ ...input, resize: "vertical", minHeight: "64px" }} rows={2} value={challenge} onChange={e => setChallenge(e.target.value)} placeholder="e.g. I ship things I don't fully understand…" />
              </div>

              {error && <p style={{ fontSize: "12px", color: C.danger, fontFamily: F.body, margin: 0 }}>{error}</p>}

              <Button fullWidth size="lg" onClick={submit} disabled={submitting}>
                {submitting ? "Joining…" : "Join the waitlist →"}
              </Button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 4px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: `${C.mint}18`, border: `1px solid ${C.mint}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "4px auto 18px", fontSize: "26px", color: C.mint }}>✓</div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>You're on the list!</h2>
            <p style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6, marginBottom: "20px" }}>
              Thanks{name ? `, ${name.split(" ")[0]}` : ""}. We saved your spot. Here's what you'll get:
            </p>
            <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
              {BENEFITS.map(b => (
                <div key={b} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ color: C.mint, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.4 }}>{b}</span>
                </div>
              ))}
            </div>
            <Button fullWidth size="lg" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}
