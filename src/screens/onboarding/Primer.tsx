import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import { getMentalModel } from "../../lib/learnContent";
import { getDemo, sleep } from "../../lib/demo";

// P3 — Web3 mental-model primer ("Before We Begin"). Optional, ~60–90s read,
// adapts to the project being built. NOT a tutorial — a builder mindset primer.
export default function Primer() {
  const navigate = useNavigate();
  const { state } = useApp();
  const items = getMentalModel(state.buildPlan);

  const go = () => navigate("/build");

  // Demo autopilot: let the viewer read, then continue to building.
  useEffect(() => {
    if (!getDemo()) return;
    let cancelled = false;
    (async () => { await sleep(4000); if (!cancelled) navigate("/build"); })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "600px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "26px", marginBottom: "8px", fontSize: "11px", color: C.purple, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            ~60 second read · optional
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "8px" }}>
            Before We Begin
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.5, maxWidth: "440px", margin: "0 auto" }}>
            A quick way to think like a builder — how these systems actually work, before you write a line.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          {items.map((m, i) => (
            <div key={i} style={{ padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ width: "26px", height: "26px", borderRadius: "8px", flexShrink: 0, background: `${C.purple}18`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", color: C.purple, fontFamily: F.mono }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "4px" }}>{m.q}</div>
                <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55 }}>{m.a}</div>
              </div>
            </div>
          ))}
        </div>

        <Button fullWidth size="lg" onClick={go}>Continue to Building →</Button>
        <button onClick={go} style={{ width: "100%", marginTop: "12px", background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>
          Skip and start building
        </button>
      </div>
    </div>
  );
}
