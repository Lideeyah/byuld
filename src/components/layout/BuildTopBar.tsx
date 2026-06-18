import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "./Logo";
import ModeTag from "../ui/ModeTag";
import TokenMeter from "../ui/TokenMeter";
import AccountMenu from "./AccountMenu";
import { useApp } from "../../context/AppContext";

const CHAIN_LABELS: Record<string, string> = {
  base: "Base",
  ethereum: "Ethereum",
  polygon: "Polygon",
  sepolia: "Sepolia",
  "base-sepolia": "Base Sepolia",
};

export default function BuildTopBar() {
  const { state } = useApp();
  const navigate = useNavigate();
  // Prefer the friendly AI-generated name; fall back to the raw goal only if absent.
  const label = state.projectName || state.goal;
  const sessionName = label.length > 40 ? label.slice(0, 40) + "…" : label;

  return (
    <div style={{
      height: "52px",
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: "16px",
      flexShrink: 0,
    }}>
      <button
        onClick={() => navigate("/dashboard")}
        title="Go to your dashboard"
        aria-label="Go to your dashboard"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
      >
        <Logo size="sm" />
      </button>

      <div style={{ width: "1px", height: "20px", background: C.border }} />

      <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {sessionName || "New Build"}
      </span>

      <ModeTag mode={state.mode} />

      <div style={{ width: "140px" }}>
        <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
      </div>

      <div style={{
        padding: "3px 10px",
        background: "rgba(0,212,170,0.1)",
        border: `1px solid ${C.mint}33`,
        borderRadius: R.full,
        fontSize: "11px",
        color: C.mint,
        fontFamily: F.mono,
        whiteSpace: "nowrap",
      }}>
        {CHAIN_LABELS[state.chain] || state.chain}
      </div>

      <AccountMenu />
    </div>
  );
}
