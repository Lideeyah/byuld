import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import { Star, Check } from "lucide-react";
import { useApp } from "../context/AppContext";
import { getDemo } from "../lib/demo";
import WaitlistModal from "../components/WaitlistModal";

const MOST_VALUABLE = ["Explanations", "Learning Concepts", "Understanding Decisions", "Verification", "Other"];

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(n)} aria-label={`${n} stars`} style={{
          background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex",
        }}>
          <Star size={28} color={n <= value ? C.warn : C.border} fill={n <= value ? C.warn : "none"} />
        </button>
      ))}
    </div>
  );
}

const label: React.CSSProperties = { fontSize: "14px", color: C.white, fontFamily: F.body, fontWeight: 600, marginBottom: "10px", display: "block" };
const card: React.CSSProperties = { padding: "20px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "14px" };
const textarea: React.CSSProperties = {
  width: "100%", padding: "11px 13px", background: C.surface2, border: `1px solid ${C.border}`,
  borderRadius: R.md, color: C.white, fontFamily: F.body, fontSize: "14px", outline: "none",
  boxSizing: "border-box", resize: "vertical", minHeight: "70px",
};
const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: R.full, cursor: "pointer", fontFamily: F.body, fontSize: "13px",
  background: on ? C.purple : C.surface2, border: `1px solid ${on ? C.purple : C.border}`,
  color: on ? "#fff" : C.textSec, transition: "all 0.12s",
});

export default function FeedbackSurvey() {
  const navigate = useNavigate();
  const { state } = useApp();
  const [rating, setRating] = useState(0);
  const [understanding, setUnderstanding] = useState(0);
  const [wouldUseAgain, setWouldUseAgain] = useState("");
  const [mostValuable, setMostValuable] = useState("");
  const [confused, setConfused] = useState("");
  const [learned, setLearned] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const finish = () => navigate("/dashboard");

  // Demo autopilot: show the feedback screen briefly, then continue to the dashboard.
  useEffect(() => {
    if (!getDemo()) return;
    const t = setTimeout(() => navigate("/dashboard"), 5000);
    return () => clearTimeout(t);
  }, [navigate]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "flow", email: state.email, experienceLevel: state.experienceLevel, contractType: state.contractType,
          rating, understanding, wouldUseAgain, mostValuable, confused, learned,
        }),
      });
    } catch { /* best effort */ }
    setSubmitting(false);
    setDone(true);
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <div style={{ width: "100%", maxWidth: "420px", textAlign: "center" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: `${C.mint}18`, border: `1px solid ${C.mint}44`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: C.mint }}><Check size={26} /></div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>Thank you</h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, marginBottom: "24px", lineHeight: 1.6 }}>
            Your feedback helps shape Byuld — and helps other builders learn what you just learned.
          </p>

          {/* Waitlist nudge — Byuld is in early access */}
          <div style={{ padding: "18px 20px", background: `${C.purple}0C`, border: `1px solid ${C.purple}33`, borderRadius: R.lg, marginBottom: "16px", textAlign: "left" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: C.white, fontFamily: F.body, marginBottom: "4px" }}>Byuld is just getting started.</div>
            <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5, marginBottom: "14px" }}>
              Join the waitlist to be first in when we launch — early access, product updates, and a say in what we build next.
            </div>
            <Button fullWidth onClick={() => setWaitlistOpen(true)}>Join the waitlist →</Button>
          </div>

          <Button fullWidth size="lg" variant="ghost" onClick={finish}>Go to my dashboard →</Button>
        </div>
        {waitlistOpen && <WaitlistModal onClose={() => setWaitlistOpen(false)} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px" }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Logo size="md" />
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "22px", marginBottom: "6px" }}>
            How was it?
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            You just built and deployed something real. A minute of feedback shapes what we build next.
          </p>
        </div>

        <div style={card}>
          <label style={label}>Overall, how would you rate your experience?</label>
          <Stars value={rating} onChange={setRating} />
        </div>

        <div style={card}>
          <label style={label}>Did Byuld help you better understand what you were building?</label>
          <Stars value={understanding} onChange={setUnderstanding} />
        </div>

        <div style={card}>
          <label style={label}>Would you use Byuld again?</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {["Yes", "Maybe", "No"].map(o => (
              <button key={o} onClick={() => setWouldUseAgain(o.toLowerCase())} style={chip(wouldUseAgain === o.toLowerCase())}>{o}</button>
            ))}
          </div>
        </div>

        <div style={card}>
          <label style={label}>What was the most valuable part of the experience?</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {MOST_VALUABLE.map(o => (
              <button key={o} onClick={() => setMostValuable(o)} style={chip(mostValuable === o)}>{o}</button>
            ))}
          </div>
        </div>

        <div style={card}>
          <label style={label}>What confused you, or what would you improve?</label>
          <textarea style={textarea} value={confused} onChange={e => setConfused(e.target.value)} placeholder="Anything that tripped you up…" />
        </div>

        <div style={card}>
          <label style={label}>What's one thing you understand now that you didn't before using Byuld?</label>
          <textarea style={textarea} value={learned} onChange={e => setLearned(e.target.value)} placeholder="e.g. Why state must change before money moves…" />
        </div>

        <Button fullWidth size="lg" onClick={submit} disabled={submitting || (!rating && !understanding)}>
          {submitting ? "Sending…" : "Submit feedback →"}
        </Button>
        <button onClick={finish} style={{ width: "100%", marginTop: "12px", background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}
