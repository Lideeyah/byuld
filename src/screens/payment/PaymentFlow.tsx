import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";

// V1 is free on testnet — subscriptions/paid tiers are not built yet.
// Honest "coming soon" state. No mock payments, no fake deployments.
export default function PaymentFlow() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "440px", textAlign: "center" }}>
        <Logo size="md" />
        <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: `${C.purple}15`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center", margin: "32px auto 24px", fontSize: "28px" }}>◈</div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "10px" }}>
          Subscriptions are coming soon
        </h1>
        <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65, marginBottom: "28px" }}>
          Right now Byuld is completely free — you deploy to a test network, so there's no real money involved. Paid plans with higher limits and more contract types are on the way.
        </p>
        <div style={{ padding: "14px 18px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "24px", fontSize: "13px", color: C.textMute, fontFamily: F.body }}>
          You currently have <strong style={{ color: C.mint }}>500 free tokens/day</strong>.
        </div>
        <Button fullWidth size="lg" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
      </div>
    </div>
  );
}
