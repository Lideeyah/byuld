import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import TokenMeter from "../components/ui/TokenMeter";
import AccountMenu from "../components/layout/AccountMenu";
import { useApp } from "../context/AppContext";
import { getDemo, setDemo, clearDemo } from "../lib/demo";

const EXPLORER: Record<string, string> = {
  "base-sepolia": "https://sepolia.basescan.org/address/",
  base: "https://basescan.org/address/",
  sepolia: "https://sepolia.etherscan.io/address/",
  ethereum: "https://etherscan.io/address/",
  polygon: "https://polygonscan.com/address/",
};

interface Build {
  name: string;
  chain: string;
  status: "deployed" | "in-progress";
  date: string;
  address?: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();

  const firstName = state.email.split("@")[0] || "there";

  // Demo autopilot: after the founder run lands here, chain into the developer run.
  // After the developer run, end the demo.
  useEffect(() => {
    const demo = getDemo();
    if (!demo) return;
    if (demo.persona === "founder") {
      const t = setTimeout(() => {
        // Reset in-memory (no reload) so the dev run starts clean.
        dispatch({ type: "RESET_SESSION", persona: null });
        setDemo("developer");
        navigate("/onboarding/persona");
      }, 6500);
      return () => clearTimeout(t);
    }
    // developer run finished → end the demo (stop autopilot)
    const t = setTimeout(() => clearDemo(), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derive REAL builds from state — no mock data ──────────────────────────
  const builds: Build[] = [];
  const hasWrittenCode = state.sections.some(s => s.code && s.code.trim().length > 0);

  if (state.contractAddress && state.deployedAt) {
    builds.push({
      name: state.projectName || state.goal || "P2P Escrow",
      chain: state.chain,
      status: "deployed",
      date: new Date(state.deployedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      address: state.contractAddress,
    });
  } else if (hasWrittenCode && state.goal) {
    builds.push({
      name: state.projectName || state.goal || "P2P Escrow",
      chain: state.chain,
      status: "in-progress",
      date: "Started",
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      <nav style={{ height: "56px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "center", padding: "0 28px", flexShrink: 0 }}>
        <div style={{ width: "100%", maxWidth: "1040px", display: "flex", alignItems: "center", gap: "20px" }}>
          <Logo size="sm" />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "120px" }}>
              <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
            </div>
            <AccountMenu />
          </div>
        </div>
      </nav>

      <div style={{ padding: "40px 28px", maxWidth: "1040px", width: "100%", alignSelf: "center", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "40px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "4px" }}>
              Welcome back, {firstName}.
            </h1>
            <p style={{ fontSize: "14px", color: C.textMute, fontFamily: F.body }}>
              {state.tokensLimit - state.tokensUsed} tokens remaining today
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/goal")}>+ New build</Button>
        </div>

        {/* Stats — real counts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "32px" }}>
          {[
            { label: "Contracts deployed", value: builds.filter(b => b.status === "deployed").length },
            { label: "Sections written", value: state.sections.filter(s => s.status === "complete").length },
            { label: "Tokens used today", value: state.tokensUsed },
          ].map(s => (
            <div key={s.label} style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
              <div style={{ fontSize: "26px", fontWeight: 700, fontFamily: F.display, color: C.white, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "6px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: C.textSec, fontFamily: F.body }}>Your builds</h2>
          {builds.length > 0 && <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>{builds.length} {builds.length === 1 ? "project" : "projects"}</span>}
        </div>

        {builds.length === 0 ? (
          // Honest empty state — no fake projects
          <div style={{ padding: "48px 24px", background: C.surface, border: `1px dashed ${C.border}`, borderRadius: R.lg, textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.5 }}>◇</div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "6px" }}>No builds yet</div>
            <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "20px" }}>
              Start your first contract and it'll appear here once you deploy it.
            </div>
            <Button onClick={() => navigate("/onboarding/goal")}>Start your first build →</Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {builds.map((b, i) => (
              <div key={i} style={{ padding: "16px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, display: "flex", alignItems: "center", gap: "16px", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple + "55")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                onClick={() => {
                  if (b.status === "in-progress") navigate("/build");
                  else if (b.address) window.open(EXPLORER[b.chain] + b.address, "_blank");
                }}
              >
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0, background: b.status === "deployed" ? `${C.mint}12` : `${C.purple}12`, border: `1px solid ${b.status === "deployed" ? C.mint + "33" : C.purple + "33"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                  {b.status === "deployed" ? "✓" : "✎"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                  <div style={{ fontSize: "12px", color: C.textMute, fontFamily: b.address ? F.mono : F.body }}>
                    {b.address ? `${b.address.slice(0, 10)}… · ${b.chain}` : `${b.date} · ${b.chain}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Badge variant="purple">P2P Escrow</Badge>
                  <Badge variant={b.status === "deployed" ? "mint" : "muted"}>
                    {b.status === "deployed" ? "Deployed" : "In progress"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
