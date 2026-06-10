import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import Button from "../components/ui/Button";
import Spinner from "../components/ui/Spinner";
import { useApp } from "../context/AppContext";

type Step = "summary" | "deploying" | "error";

const STAGES = [
  { label: "Compiling your contract…", sub: "Turning your Solidity into bytecode" },
  { label: "Submitting to Base Sepolia…", sub: "Broadcasting the deployment transaction" },
  { label: "Waiting for confirmation…", sub: "Usually 5–20 seconds on Base Sepolia" },
];

export default function Deploy() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const [step, setStep] = useState<Step>("summary");
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  // Assemble the user's actual code from every section into one contract.
  const assembled = state.sections.map((s) => s.code).filter(Boolean).join("\n\n");

  const deploy = async () => {
    setStep("deploying");
    setStage(0);
    setError(null);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: assembled }),
      });
      // advance the visual stages while the request resolves
      setStage(1);
      const data = await res.json();
      setStage(2);

      if (!res.ok) {
        const titles: Record<string, string> = {
          not_configured: "Deployment not configured yet",
          no_gas: "Deployer wallet needs test ETH",
          compile_error: "Your contract didn't compile",
          deploy_failed: "Deployment failed",
        };
        setError({ title: titles[data.error] ?? "Deployment failed", message: data.message ?? "Something went wrong." });
        setStep("error");
        return;
      }

      dispatch({ type: "SET_DEPLOYED", contractAddress: data.contractAddress, txHash: data.txHash });
      if (state.email) {
        fetch("/api/notify-deploy", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: state.email, contractAddress: data.contractAddress, chain: "base-sepolia", contractType: "escrow", txHash: data.txHash }),
        }).catch(() => {});
      }
      setTimeout(() => navigate("/success"), 600);
    } catch (err: unknown) {
      setError({ title: "Network error", message: err instanceof Error ? err.message : "Could not reach the deploy service." });
      setStep("error");
    }
  };

  // ── Summary ──────────────────────────────────────────────────────────────
  if (step === "summary") {
    return (
      <Shell title="Ready to deploy">
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
            {[
              ["Contract", "P2P Escrow"],
              ["Chain", "Base Sepolia Testnet"],
              ["Goal", state.goal.slice(0, 50) + (state.goal.length > 50 ? "…" : "")],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>{k}</span>
                <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: "14px 16px", background: `${C.mint}0A`, border: `1px solid ${C.mint}22`, borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            This is a <strong style={{ color: C.white }}>testnet deployment</strong>. No real money is involved — Base Sepolia is a free practice network.
          </div>

          <Button fullWidth size="lg" onClick={deploy}>Deploy to Base Sepolia →</Button>
        </div>
      </Shell>
    );
  }

  // ── Deploying ────────────────────────────────────────────────────────────
  if (step === "deploying") {
    return (
      <Shell title="Deploying your contract…">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {STAGES.map((s, i) => {
            const done = i < stage, active = i === stage;
            return (
              <div key={i} style={{ padding: "14px 18px", background: C.surface, border: `1px solid ${done ? C.mint + "44" : active ? C.purple + "44" : C.border}`, borderRadius: R.md, display: "flex", gap: "14px", alignItems: "center", opacity: !done && !active ? 0.4 : 1, transition: "all 0.3s" }}>
                <div style={{ flexShrink: 0 }}>
                  {done ? <span style={{ color: C.mint, fontSize: "16px" }}>✓</span> : active ? <Spinner size={16} color={C.purple} /> : <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${C.border}` }} />}
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: done ? C.mint : active ? C.white : C.textMute, fontFamily: F.body }}>{s.label}</div>
                  <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  return (
    <Shell title={error?.title ?? "Deployment failed"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ padding: "16px 18px", background: `${C.danger}0A`, border: `1px solid ${C.danger}44`, borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
          {error?.message}
        </div>
        <Button fullWidth onClick={() => setStep("summary")}>Try again</Button>
        <button onClick={() => navigate("/build")} style={{ background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>← Back to the editor</button>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "460px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Logo size="md" />
          <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, marginTop: "24px" }}>{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
