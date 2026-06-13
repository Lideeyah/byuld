import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import { useApp } from "../../context/AppContext";
import ProgressStep from "../../components/ui/ProgressStep";
import type { Chain } from "../../types";
import { getDemo } from "../../lib/demo";

const STEPS = ["You", "Wallet", "Chain", "Goal", "Review"];

const CHAINS: {
  id: Chain; name: string; tag?: string; available: boolean;
  desc: string; help: string;
}[] = [
  {
    id: "sepolia", name: "Ethereum Sepolia", tag: "Recommended for beginners", available: true,
    desc: "The original Ethereum test network. Free, widely supported, easy to get test ETH.",
    help: "Ethereum Sepolia is the most widely-used testnet. It's free, and you can mine test ETH in your browser. On Ethereum mainnet, deploying a contract can cost $5–$50+ depending on congestion.",
  },
  {
    id: "base-sepolia", name: "Base Sepolia", available: false,
    desc: "Coinbase's Layer 2 test network. Fast and low-cost.",
    help: "Base is an Ethereum Layer 2 built by Coinbase. Coming soon to Byuld.",
  },
  {
    id: "polygon", name: "Polygon Amoy", available: false,
    desc: "Lower-cost alternative. Good for apps with frequent transactions.",
    help: "Polygon is a low-cost Ethereum sidechain. Its Amoy testnet is free; on mainnet, transactions typically cost well under a cent.",
  },
];

export default function ChainSelection() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [selected, setSelected] = useState<Chain>("sepolia");
  const [openHelp, setOpenHelp] = useState<Chain | null>(null);

  const handleContinue = () => {
    dispatch({ type: "SET_CHAIN", chain: selected });
    navigate("/onboarding/goal");
  };

  // Demo autopilot: Sepolia is already selected — pause to show it, then continue.
  useEffect(() => {
    if (!getDemo()) return;
    const t = setTimeout(() => { dispatch({ type: "SET_CHAIN", chain: "sepolia" }); navigate("/onboarding/goal"); }, 2600);
    return () => clearTimeout(t);
  }, [dispatch, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "560px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Logo size="md" />
          <div style={{ marginTop: "32px", marginBottom: "12px" }}>
            <ProgressStep steps={STEPS} current={2} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "28px", marginBottom: "8px" }}>
            Where do you want to deploy?
          </h1>
          <p style={{ fontSize: "14px", color: C.textSec, fontFamily: F.body }}>
            These are all test networks. No real money is involved while you learn.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
          {CHAINS.map(ch => {
            const isSel = selected === ch.id;
            return (
              <div key={ch.id}>
                <button
                  onClick={() => ch.available && setSelected(ch.id)}
                  disabled={!ch.available}
                  style={{
                    width: "100%", padding: "18px 20px", textAlign: "left",
                    background: isSel ? `${C.purple}12` : C.surface,
                    border: `1px solid ${isSel ? C.purple : C.border}`,
                    borderRadius: R.lg, cursor: ch.available ? "pointer" : "not-allowed",
                    opacity: ch.available ? 1 : 0.55, transition: "all 0.15s",
                    display: "flex", alignItems: "flex-start", gap: "14px",
                  }}
                >
                  <div style={{ width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, marginTop: "2px", border: `2px solid ${isSel ? C.purple : C.border}`, background: isSel ? C.purple : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isSel && <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#fff" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "15px", fontWeight: 600, fontFamily: F.body, color: C.white }}>{ch.name}</span>
                      {ch.tag && (
                        <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: F.body, color: C.mint, border: `1px solid ${C.mint}55`, borderRadius: R.full, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{ch.tag}</span>
                      )}
                      {!ch.available && (
                        <span style={{ fontSize: "10px", fontWeight: 700, fontFamily: F.body, color: C.textMute, border: `1px solid ${C.border}`, borderRadius: R.full, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Coming soon</span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5, marginBottom: "6px" }}>{ch.desc}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "12px", color: C.mint, fontFamily: F.body }}>Free · testnet</span>
                      <span onClick={(e) => { e.stopPropagation(); setOpenHelp(openHelp === ch.id ? null : ch.id); }} style={{ fontSize: "12px", color: C.purple, fontFamily: F.body, cursor: "pointer" }}>
                        {openHelp === ch.id ? "Hide" : "What's this?"}
                      </span>
                    </div>
                  </div>
                </button>
                {openHelp === ch.id && (
                  <div style={{ padding: "14px 18px", margin: "8px 0 0", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
                    {ch.help}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button fullWidth size="lg" onClick={handleContinue}>Continue →</Button>
      </div>
    </div>
  );
}
