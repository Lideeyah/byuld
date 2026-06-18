import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import TokenMeter from "../components/ui/TokenMeter";
import AccountMenu from "../components/layout/AccountMenu";
import { useApp } from "../context/AppContext";
import { getDemo, setDemo, clearDemo } from "../lib/demo";
import { getDeployedBuilds, type BuildRecord } from "../lib/builds";

const EXPLORER: Record<string, string> = {
  "base-sepolia": "https://sepolia.basescan.org/address/",
  base: "https://basescan.org/address/",
  sepolia: "https://sepolia.etherscan.io/address/",
  ethereum: "https://etherscan.io/address/",
  polygon: "https://polygonscan.com/address/",
};

const prettyType = (t: string) =>
  (t || "contract").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const SectionLabel = ({ children, count }: { children: React.ReactNode; count?: number }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
    <h2 style={{ fontSize: "13px", fontWeight: 700, color: C.textSec, fontFamily: F.body, letterSpacing: "0.03em", textTransform: "uppercase", margin: 0 }}>{children}</h2>
    {count !== undefined && <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.mono }}>{count}</span>}
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [copied, setCopied] = useState("");

  const firstName = state.email.split("@")[0] || "there";

  // Demo autopilot: after the founder run lands here, chain into the developer run.
  useEffect(() => {
    const demo = getDemo();
    if (!demo) return;
    if (demo.persona === "founder") {
      const t = setTimeout(() => {
        dispatch({ type: "RESET_SESSION", persona: null });
        setDemo("developer");
        navigate("/onboarding/persona");
      }, 6500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => clearDemo(), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real data: deployed builds from history + the current in-progress build (if any).
  const deployed: BuildRecord[] = getDeployedBuilds(state.email);
  const hasWrittenCode = state.sections.some(s => s.code && s.code.trim().length > 0);
  const inProgress = (state.goal && hasWrittenCode && !state.contractAddress)
    ? {
        name: state.projectName || state.goal || "Untitled build",
        contractType: state.buildPlan?.contractType || state.contractType || "escrow",
        chain: state.chain,
        done: state.sections.filter(s => s.status === "complete").length,
        total: state.sections.length || 4,
      }
    : null;

  const copy = (addr: string) => {
    navigator.clipboard?.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(""), 1800);
  };

  const isEmpty = !inProgress && deployed.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{ height: "56px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "center", padding: "0 28px", flexShrink: 0 }}>
        <div style={{ width: "100%", maxWidth: "1040px", display: "flex", alignItems: "center", gap: "20px" }}>
          <button onClick={() => navigate("/dashboard")} aria-label="Dashboard" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}>
            <Logo size="sm" />
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "120px" }}>
              <TokenMeter used={state.tokensUsed} limit={state.tokensLimit} />
            </div>
            <AccountMenu />
          </div>
        </div>
      </nav>

      <div style={{ padding: "40px 28px 80px", maxWidth: "1040px", width: "100%", alignSelf: "center", boxSizing: "border-box" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginBottom: "40px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "6px" }}>
              Welcome back, {firstName}.
            </h1>
            <p style={{ fontSize: "14px", color: C.textMute, fontFamily: F.body }}>
              {deployed.length > 0 || inProgress
                ? `${deployed.length} deployed${inProgress ? " · 1 in progress" : ""}`
                : "Your builds will show up here."}
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/goal")}>+ New build</Button>
        </div>

        {isEmpty ? (
          <div style={{ padding: "56px 24px", background: C.surface, border: `1px dashed ${C.border}`, borderRadius: R.lg, textAlign: "center" }}>
            <div style={{ fontSize: "30px", marginBottom: "14px", opacity: 0.5 }}>◇</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "6px" }}>Nothing here yet</div>
            <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "22px", maxWidth: "360px", margin: "0 auto 22px" }}>
              Build your first smart contract — you'll understand every line, and it'll live here once it's deployed.
            </div>
            <Button onClick={() => navigate("/onboarding/goal")}>Start your first build →</Button>
          </div>
        ) : (
          <>
            {/* Continue building */}
            {inProgress && (
              <div style={{ marginBottom: "36px" }}>
                <SectionLabel>Continue building</SectionLabel>
                <div style={{
                  padding: "20px 22px", background: `${C.purple}0C`, border: `1px solid ${C.purple}44`,
                  borderRadius: R.lg, display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap",
                }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, background: `${C.purple}1E`, border: `1px solid ${C.purple}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", color: C.purple }}>✎</div>
                  <div style={{ flex: 1, minWidth: "180px" }}>
                    <div style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "4px" }}>{inProgress.name}</div>
                    <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
                      {prettyType(inProgress.contractType)} · {inProgress.done}/{inProgress.total} sections written
                    </div>
                  </div>
                  <Button onClick={() => navigate("/build")}>Continue →</Button>
                </div>
              </div>
            )}

            {/* Deployed */}
            <div>
              <SectionLabel count={deployed.length || undefined}>Deployed</SectionLabel>
              {deployed.length === 0 ? (
                <div style={{ padding: "28px 24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, fontSize: "13px", color: C.textMute, fontFamily: F.body, textAlign: "center" }}>
                  No deployments yet. Finish a build and it'll appear here, live on-chain.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "14px" }}>
                  {deployed.map(b => (
                    <div key={b.id} style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <div style={{ width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0, background: `${C.mint}12`, border: `1px solid ${C.mint}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", color: C.mint }}>✓</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <Badge variant="purple">{prettyType(b.contractType)}</Badge>
                            <Badge variant="mint">Deployed</Badge>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: C.surface2, borderRadius: R.md }}>
                        <code style={{ flex: 1, fontFamily: F.mono, fontSize: "12px", color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.contractAddress}</code>
                        <button onClick={() => copy(b.contractAddress)} style={{ flexShrink: 0, background: "none", border: `1px solid ${copied === b.contractAddress ? C.mint : C.border}`, borderRadius: R.md, color: copied === b.contractAddress ? C.mint : C.textMute, fontFamily: F.body, fontSize: "11px", padding: "3px 9px", cursor: "pointer" }}>
                          {copied === b.contractAddress ? "✓" : "Copy"}
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>
                          {b.chain} · {new Date(b.deployedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <a href={(EXPLORER[b.chain] || EXPLORER.sepolia) + b.contractAddress} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: C.purple, fontFamily: F.body, textDecoration: "none", fontWeight: 600 }}>
                          Explorer ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
