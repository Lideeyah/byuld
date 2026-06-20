import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Pencil, Boxes, Plus, ExternalLink } from "lucide-react";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import TokenMeter from "../components/ui/TokenMeter";
import AccountMenu from "../components/layout/AccountMenu";
import { useApp } from "../context/AppContext";
import { getDemo, clearDemo } from "../lib/demo";
import { getDeployedBuilds, fetchBuildsRemote, type ServerBuild } from "../lib/builds";
import { useScreenTime } from "../lib/analytics";

const EXPLORER: Record<string, string> = {
  "base-sepolia": "https://sepolia.basescan.org/address/",
  base: "https://basescan.org/address/",
  sepolia: "https://sepolia.etherscan.io/address/",
  ethereum: "https://etherscan.io/address/",
  polygon: "https://polygonscan.com/address/",
};

const prettyType = (t: string) =>
  (t || "contract").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const buildProgress = (sections?: { status: string }[] | null) => {
  const total = sections?.length || 4;
  const done = sections?.filter(s => s.status === "complete").length || 0;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
};

const relTime = (ts?: number) => {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const ProgressBar = ({ pct }: { pct: number }) => (
  <div style={{ height: "6px", background: C.surface2, borderRadius: "3px", overflow: "hidden", width: "100%" }}>
    <div style={{ height: "100%", width: `${pct}%`, background: C.purple, borderRadius: "3px", transition: "width 0.4s" }} />
  </div>
);

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
  useScreenTime("dashboard");

  const firstName = state.email.split("@")[0] || "there";

  // Demo autopilot: the run ends here — the viewer sees the deployed build on the
  // dashboard. Hold a beat, then clear the demo flag.
  useEffect(() => {
    if (!getDemo()) return;
    const t = setTimeout(() => clearDemo(), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Builds are stored on the account (server) so they follow the user to any
  // device; the local cache renders instantly while the server list loads.
  const [serverBuilds, setServerBuilds] = useState<ServerBuild[]>([]);
  useEffect(() => {
    if (state.email) fetchBuildsRemote(state.email).then(setServerBuilds).catch(() => {});
  }, [state.email]);

  // Deployed — merge server + local, deduped by contract address.
  const deployedMap = new Map<string, { id: string; name: string; contractType: string; contractAddress: string; chain: string; deployedAt: number }>();
  for (const b of serverBuilds) {
    if (b.status === "deployed" && b.contractAddress)
      deployedMap.set(b.contractAddress, { id: b.contractAddress, name: b.name || b.projectName || b.goal || "Smart contract", contractType: b.contractType || "escrow", contractAddress: b.contractAddress, chain: b.chain || "sepolia", deployedAt: b.deployedAt || 0 });
  }
  for (const b of getDeployedBuilds(state.email)) {
    if (b.contractAddress && !deployedMap.has(b.contractAddress))
      deployedMap.set(b.contractAddress, { id: b.contractAddress, name: b.name, contractType: b.contractType, contractAddress: b.contractAddress, chain: b.chain, deployedAt: b.deployedAt || 0 });
  }
  const deployed = [...deployedMap.values()];

  // In-progress (resumable). Server builds first; fall back to the live local session.
  const deployedIds = new Set(deployed.map(d => d.contractAddress));
  const wipBuilds = serverBuilds
    .filter(b => b.status === "in_progress" && !(b.contractAddress && deployedIds.has(b.contractAddress)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const hasWrittenCode = state.sections.some(s => s.code && s.code.trim().length > 0);
  const localWip = (state.goal && hasWrittenCode && !state.contractAddress && !wipBuilds.some(b => b.buildId === state.buildId));

  const continueBuild = (b: ServerBuild) => {
    dispatch({ type: "HYDRATE_BUILD", build: {
      buildId: b.buildId, goal: b.goal || "", projectName: b.projectName || undefined,
      contractType: b.contractType || undefined, chain: (b.chain as typeof state.chain) || undefined,
      buildPlan: b.buildPlan || null, sections: b.sections || undefined, currentSection: b.currentSection || 0,
    } });
    navigate("/build");
  };

  const copy = (addr: string) => {
    navigator.clipboard?.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(""), 1800);
  };

  const wipCount = wipBuilds.length + (localWip ? 1 : 0);
  const isEmpty = wipCount === 0 && deployed.length === 0;

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
        {/* Smart return trigger — focus on unfinished progress, not a generic nudge */}
        {wipBuilds[0] && (() => {
          const b = wipBuilds[0];
          const p = buildProgress(b.sections);
          const left = Math.max(0, p.total - p.done);
          return (
            <div style={{ marginBottom: "28px", padding: "18px 22px", background: `${C.purple}10`, border: `1px solid ${C.purple}44`, borderRadius: R.lg, display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: C.purple, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: F.body, marginBottom: "5px" }}>Pick up where you left off</div>
                <div style={{ fontSize: "14px", color: C.white, fontFamily: F.body, marginBottom: "10px" }}>
                  You're <strong>{p.pct}%</strong> through your {b.name || b.projectName || "build"}{left > 0 ? ` — ${left} section${left === 1 ? "" : "s"} left to reach deployment.` : " — finish the review to deploy."}
                </div>
                <ProgressBar pct={p.pct} />
              </div>
              <Button onClick={() => continueBuild(b)}>Resume →</Button>
            </div>
          );
        })()}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", marginBottom: "40px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, marginBottom: "6px" }}>
              Welcome back, {firstName}.
            </h1>
            <p style={{ fontSize: "14px", color: C.textMute, fontFamily: F.body }}>
              {deployed.length > 0 || wipCount > 0
                ? `${deployed.length} deployed${wipCount > 0 ? ` · ${wipCount} in progress` : ""}`
                : "Your builds will show up here."}
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/goal")}><Plus size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />New build</Button>
        </div>

        {isEmpty ? (
          <div style={{ padding: "56px 24px", background: C.surface, border: `1px dashed ${C.border}`, borderRadius: R.lg, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px", opacity: 0.5 }}><Boxes size={30} color={C.textMute} /></div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "6px" }}>Nothing here yet</div>
            <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginBottom: "22px", maxWidth: "360px", margin: "0 auto 22px" }}>
              Build your first smart contract — you'll understand every line, and it'll live here once it's deployed.
            </div>
            <Button onClick={() => navigate("/onboarding/goal")}>Start your first build →</Button>
          </div>
        ) : (
          <>
            {/* Continue building — the top unfinished build is in the banner above,
                so list only the others here to avoid repeating it. */}
            {(wipBuilds.length > 1 || localWip) && (
              <div style={{ marginBottom: "36px" }}>
                <SectionLabel>Continue building</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {wipBuilds.slice(1).map(b => {
                    const p = buildProgress(b.sections);
                    return (
                      <div key={b.buildId} style={{
                        padding: "20px 22px", background: `${C.purple}0C`, border: `1px solid ${C.purple}44`,
                        borderRadius: R.lg, display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap",
                      }}>
                        <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, background: `${C.purple}1E`, border: `1px solid ${C.purple}44`, display: "flex", alignItems: "center", justifyContent: "center", color: C.purple }}><Pencil size={19} /></div>
                        <div style={{ flex: 1, minWidth: "200px" }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px", marginBottom: "4px" }}>
                            <span style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body }}>{b.name || b.projectName || b.goal || "Untitled build"}</span>
                            {b.updatedAt ? <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>{relTime(b.updatedAt)}</span> : null}
                          </div>
                          <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, marginBottom: "9px" }}>
                            {prettyType(b.contractType || "escrow")} · {p.done}/{p.total} sections · {p.pct}%
                          </div>
                          <ProgressBar pct={p.pct} />
                        </div>
                        <Button onClick={() => continueBuild(b)}>Continue →</Button>
                      </div>
                    );
                  })}
                  {localWip && (
                    <div style={{
                      padding: "20px 22px", background: `${C.purple}0C`, border: `1px solid ${C.purple}44`,
                      borderRadius: R.lg, display: "flex", alignItems: "center", gap: "18px", flexWrap: "wrap",
                    }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0, background: `${C.purple}1E`, border: `1px solid ${C.purple}44`, display: "flex", alignItems: "center", justifyContent: "center", color: C.purple }}><Pencil size={19} /></div>
                      <div style={{ flex: 1, minWidth: "180px" }}>
                        <div style={{ fontSize: "15px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "4px" }}>{state.projectName || state.goal || "Untitled build"}</div>
                        <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
                          {prettyType(state.buildPlan?.contractType || state.contractType || "escrow")} · {state.sections.filter(s => s.status === "complete").length}/{state.sections.length || 4} sections written
                        </div>
                      </div>
                      <Button onClick={() => navigate("/build")}>Continue →</Button>
                    </div>
                  )}
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
                        <div style={{ width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0, background: `${C.mint}12`, border: `1px solid ${C.mint}33`, display: "flex", alignItems: "center", justifyContent: "center", color: C.mint }}><Check size={18} /></div>
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
                        <a href={(EXPLORER[b.chain] || EXPLORER.sepolia) + b.contractAddress} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: C.purple, fontFamily: F.body, textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          Explorer <ExternalLink size={12} />
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
