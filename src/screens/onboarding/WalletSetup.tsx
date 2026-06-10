import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

const FACTS = [
  { icon: "◉", text: "Your wallet address is public — it works like a username on the blockchain." },
  { icon: "◈", text: "You'll need a small amount of test ETH to deploy. Byuld gets it for you from a testnet faucet — no real money." },
  { icon: "⬡", text: "Your wallet is secured by Privy. You can export it to a standard wallet app later." },
];

export default function WalletSetup() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isFounder = state.persona === "founder";

  // The REAL wallet address from Privy — embedded wallet for founders, connected for devs.
  const realAddress = wallets[0]?.address ?? user?.wallet?.address ?? state.walletAddress ?? "";

  // Sync the real address into app state once it exists.
  useEffect(() => {
    if (realAddress && realAddress !== state.walletAddress) {
      dispatch({ type: "SET_AUTHENTICATED", walletAddress: realAddress });
    }
  }, [realAddress]);

  const short = realAddress.length > 14 ? realAddress.slice(0, 6) + "…" + realAddress.slice(-4) : realAddress;
  const ready = !!realAddress;

  const copy = () => {
    navigator.clipboard?.writeText(realAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={1} />
          </div>
          {ready && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 14px", marginTop: "28px", background: `${C.mint}12`, border: `1px solid ${C.mint}33`, borderRadius: R.full, fontSize: "12px", color: C.mint, fontFamily: F.body, fontWeight: 600 }}>
              <span style={{ fontSize: "14px" }}>✓</span> Wallet ready
            </div>
          )}
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: ready ? "20px" : "28px", marginBottom: "8px" }}>
            {isFounder ? "Your Web3 wallet is ready." : "Wallet connected."}
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body, lineHeight: 1.65, maxWidth: "380px", margin: "0 auto" }}>
            {isFounder
              ? "A wallet is your identity in Web3 — it's how you sign and deploy what you build. Yours was created automatically and is secured by your email."
              : "This is the wallet you'll use to deploy your contract on the testnet."}
          </p>
        </div>

        {/* Real address card — or honest loading state */}
        <div style={{ padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: R.lg, flexShrink: 0, background: `${C.purple}20`, border: `1px solid ${C.purple}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", color: C.purple }}>◉</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "3px" }}>Your wallet address</div>
            {ready ? (
              <div style={{ fontFamily: F.mono, fontSize: "13px", color: C.textSec }}>{short}</div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Spinner size={12} color={C.purple} />
                <span style={{ fontFamily: F.body, fontSize: "12px", color: C.textMute }}>Setting up your wallet…</span>
              </div>
            )}
          </div>
          {ready && (
            <button onClick={copy} style={{ background: "none", border: `1px solid ${copied ? C.mint : C.border}`, borderRadius: R.md, cursor: "pointer", color: copied ? C.mint : C.textMute, fontSize: "12px", fontFamily: F.body, padding: "5px 10px" }}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
          )}
        </div>

        {/* Expandable explainer */}
        <button onClick={() => setExpanded(!expanded)} style={{ width: "100%", padding: "12px 16px", background: expanded ? C.surface : "transparent", border: `1px solid ${C.border}`, borderRadius: R.md, color: C.textSec, fontFamily: F.body, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: expanded ? 0 : "20px", borderBottomLeftRadius: expanded ? 0 : R.md, borderBottomRightRadius: expanded ? 0 : R.md, transition: "all 0.15s" }}>
          What do I need to know?
          <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: "12px" }}>▾</span>
        </button>
        {expanded && (
          <div style={{ border: `1px solid ${C.border}`, borderTop: "none", borderBottomLeftRadius: R.md, borderBottomRightRadius: R.md, overflow: "hidden", marginBottom: "20px" }}>
            {FACTS.map((f, i) => (
              <div key={i} style={{ padding: "14px 16px", display: "flex", gap: "12px", alignItems: "flex-start", borderBottom: i < FACTS.length - 1 ? `1px solid ${C.border}` : "none", background: C.surface }}>
                <span style={{ color: C.purple, flexShrink: 0, fontSize: "16px" }}>{f.icon}</span>
                <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55 }}>{f.text}</span>
              </div>
            ))}
          </div>
        )}

        <Button fullWidth size="lg" disabled={!ready} onClick={() => navigate("/onboarding/chain")}>
          {ready ? "Continue →" : "Setting up…"}
        </Button>
      </div>
    </div>
  );
}
