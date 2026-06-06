import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { MoonPayBuyWidget } from "@moonpay/moonpay-react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, createPublicClient, custom, http, type Chain } from "viem";
import { base, baseSepolia, mainnet, polygon } from "viem/chains";
import { C, F, R } from "../../tokens";
import Logo from "../../components/layout/Logo";
import Button from "../../components/ui/Button";
import Spinner from "../../components/ui/Spinner";
import { useApp } from "../../context/AppContext";

type PayStep = "summary" | "stripe" | "moonpay" | "deploying";

const DEPLOY_STAGES = [
  { id: "sign",    label: "Signing transaction…",       sub: "Your wallet authorises the deployment" },
  { id: "submit",  label: "Submitting to network…",     sub: "Broadcasting to the blockchain" },
  { id: "confirm", label: "Waiting for confirmation…",  sub: "Usually 15–60 seconds on Base" },
];

const VIEM_CHAINS: Record<string, Chain> = {
  base: base, "base-sepolia": baseSepolia,
  ethereum: mainnet, polygon: polygon, sepolia: baseSepolia,
};

const PUBLIC_RPC: Record<string, string> = {
  base: "https://mainnet.base.org",
  "base-sepolia": "https://sepolia.base.org",
  ethereum: "https://eth.drpc.org",
  polygon: "https://polygon.drpc.org",
  sepolia: "https://sepolia.base.org",
};

const CHAIN_FEE: Record<string, number> = {
  base: 0.80, ethereum: 4.50, polygon: 0.20, sepolia: 0, "base-sepolia": 0,
};
const BYULD_FEE = 6;

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// ─── Stripe inner form ────────────────────────────────────────────────────────

function StripeForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    if (!stripe || !elements) return;
    setLoading(true);
    setError("");
    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + "/payment" },
      redirect: "if_required",
    });
    if (stripeErr) {
      setError(stripeErr.message ?? "Payment failed. Try again.");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ padding: "16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error && (
        <div style={{ fontSize: "12px", color: C.danger, fontFamily: F.body, padding: "8px 12px", background: `${C.danger}0A`, borderRadius: R.md }}>
          {error}
        </div>
      )}
      <Button fullWidth size="lg" disabled={!stripe || loading} onClick={pay}>
        {loading ? <><Spinner size={16} color="#fff" /> Processing…</> : `Pay $${BYULD_FEE}`}
      </Button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PaymentFlow() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { wallets } = useWallets();
  const [step, setStep] = useState<PayStep>("summary");
  const [deployError, setDeployError] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [deployStage, setDeployStage] = useState(0);
  const [txHash, setTxHash] = useState("");
  const gasFee = CHAIN_FEE[state.chain] ?? 0.80;
  const isTestnet = state.chain.includes("sepolia");

  useEffect(() => {
    if (isTestnet) return;
    setLoadingSecret(true);
    fetch("/api/create-payment-intent", { method: "POST" })
      .then(r => r.json())
      .then(d => { if (d.clientSecret) setClientSecret(d.clientSecret); })
      .catch(console.error)
      .finally(() => setLoadingSecret(false));
  }, [isTestnet]);

  // ── Summary ─────────────────────────────────────────────────────────────────
  if (step === "summary") {
    return (
      <Shell title="Ready to Deploy">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>Contract summary</div>
            {[
              ["Type",  state.contractType],
              ["Chain", state.chain.charAt(0).toUpperCase() + state.chain.slice(1)],
              ["Goal",  state.goal.slice(0, 60) + (state.goal.length > 60 ? "…" : "")],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>{k}</span>
                <span style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: "18px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>Fee breakdown</div>
            {[
              { label: "Byuld security review", amount: `$${BYULD_FEE}`, note: "Paid to Byuld · Card" },
              { label: "Estimated gas", amount: isTestnet ? "Free" : `≈ $${gasFee.toFixed(2)}`, note: "Paid to network · ETH" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
                <div>
                  <div style={{ fontSize: "13px", color: C.textSec, fontFamily: F.body }}>{row.label}</div>
                  <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>{row.note}</div>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.mono }}>{row.amount}</div>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: C.white, fontFamily: F.body }}>Total (estimate)</span>
              <span style={{ fontSize: "14px", fontWeight: 700, color: C.white, fontFamily: F.mono }}>{isTestnet ? "Free" : `≈ $${(BYULD_FEE + gasFee).toFixed(2)}`}</span>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.5 }}>
            You'll complete two quick payment steps: first the Byuld review fee by card, then fund your wallet for gas.
          </div>

          <Button fullWidth size="lg" onClick={() => setStep(isTestnet ? "moonpay" : "stripe")}>
            {isTestnet ? "Deploy to Testnet (Free) →" : `Deploy to ${state.chain} →`}
          </Button>
        </div>
      </Shell>
    );
  }

  // ── Stripe ───────────────────────────────────────────────────────────────────
  if (step === "stripe") {
    return (
      <Shell title={`Pay Byuld Review Fee — $${BYULD_FEE}`}>
        {loadingSecret || !clientSecret ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
            <Spinner size={24} color={C.purple} />
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: C.purple,
                  colorBackground: C.surface2,
                  colorText: C.white,
                  colorDanger: C.danger,
                  fontFamily: F.body,
                  borderRadius: "8px",
                },
              },
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <StripeForm onSuccess={() => { dispatch({ type: "SET_BYULD_FEE_PAID" }); setStep("moonpay"); }} />
              <button onClick={() => setStep("summary")} style={{ background: "none", border: "none", color: C.textMute, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}>← Go back</button>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🔒</span> Secured by Stripe
              </div>
            </div>
          </Elements>
        )}
      </Shell>
    );
  }

  // ── MoonPay ──────────────────────────────────────────────────────────────────
  if (step === "moonpay") {
    const onFunded = () => {
      dispatch({ type: "SET_GAS_FUNDED" });
      setStep("deploying");
      runDeploy();
    };

    return (
      <Shell title={isTestnet ? "Ready to Deploy" : `Fund Wallet — ≈ $${(gasFee * 1.2).toFixed(2)} ETH`}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ padding: "14px 16px", background: `${C.purple}0A`, border: `1px solid ${C.purple}22`, borderRadius: R.md, fontSize: "13px", color: C.textSec, fontFamily: F.body, lineHeight: 1.6 }}>
            To put your contract on the blockchain, you need a small network fee called <strong style={{ color: C.white }}>gas</strong>. It goes to the network, not to Byuld.
          </div>

          {!isTestnet && state.walletAddress && (
            <div style={{ borderRadius: R.md, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <MoonPayBuyWidget
                variant="embedded"
                baseCurrencyCode="usd"
                baseCurrencyAmount={String((gasFee * 1.2).toFixed(2))}
                currencyCode="eth"
                walletAddress={state.walletAddress}
                visible
              />
            </div>
          )}

          {isTestnet && (
            <div style={{ padding: "14px 16px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount needed</div>
              <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.mono, color: C.white }}>Free</div>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "3px" }}>Testnet deployment costs nothing</div>
            </div>
          )}

          <Button fullWidth size="lg" onClick={onFunded}>
            {isTestnet ? "Deploy to Testnet →" : "I've funded my wallet →"}
          </Button>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, display: "flex", alignItems: "center", gap: "6px" }}>
            <span>🔒</span> {isTestnet ? "Testnet — no real ETH needed" : "Powered by MoonPay · ETH sent directly to your wallet"}
          </div>
        </div>
      </Shell>
    );
  }

  // ── Deploying ─────────────────────────────────────────────────────────────────
  if (step === "deploying") {
    return (
      <Shell title="Deploying your contract…">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {DEPLOY_STAGES.map((stage, i) => {
            const done   = i < deployStage;
            const active = i === deployStage;
            return (
              <div key={stage.id} style={{
                padding: "14px 18px", background: C.surface,
                border: `1px solid ${done ? C.mint + "44" : active ? C.purple + "44" : C.border}`,
                borderRadius: R.md, display: "flex", gap: "14px", alignItems: "center",
                opacity: !done && !active ? 0.4 : 1, transition: "all 0.3s",
              }}>
                <div style={{ flexShrink: 0 }}>
                  {done   ? <span style={{ color: C.mint, fontSize: "16px" }}>✓</span>
                          : active ? <Spinner size={16} color={C.purple} />
                          : <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${C.border}` }} />}
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: done ? C.mint : active ? C.white : C.textMute, fontFamily: F.body }}>{stage.label}</div>
                  <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>{stage.sub}</div>
                </div>
              </div>
            );
          })}
          {txHash && (
            <div style={{ marginTop: "8px", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md }}>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "4px" }}>TX Hash</div>
              <div style={{ fontFamily: F.mono, fontSize: "11px", color: C.purple, wordBreak: "break-all" }}>{txHash.slice(0, 42)}…</div>
            </div>
          )}
          {deployError && (
            <div style={{ padding: "12px 14px", background: `${C.danger}0A`, border: `1px solid ${C.danger}44`, borderRadius: R.md, fontSize: "12px", color: C.danger, fontFamily: F.body }}>
              ⚠ {deployError}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  return null;

  async function runDeploy() {
    setDeployError("");
    try {
      // ── Stage 0: compile ──────────────────────────────────────────────────
      const source = state.sections.map(s => s.code).filter(Boolean).join("\n\n");
      const compileRes = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const compiled = await compileRes.json();
      if (!compileRes.ok) throw new Error(compiled.errors?.[0] ?? "Compilation failed");

      // ── Stage 1: get wallet + sign ────────────────────────────────────────
      setDeployStage(0);
      const wallet = wallets[0];
      if (!wallet) throw new Error("No wallet connected. Please go back and connect your wallet.");
      const provider = await wallet.getEthereumProvider();
      const viemChain = VIEM_CHAINS[state.chain] ?? base;
      const walletClient = createWalletClient({ chain: viemChain, transport: custom(provider) });
      const [account] = await walletClient.getAddresses();

      // ── Stage 2: broadcast ────────────────────────────────────────────────
      setDeployStage(1);
      const hash = await walletClient.deployContract({
        abi: compiled.abi,
        bytecode: compiled.bytecode as `0x${string}`,
        account,
      });
      setTxHash(hash);

      // ── Stage 3: wait for confirmation ────────────────────────────────────
      setDeployStage(2);
      const publicClient = createPublicClient({
        chain: viemChain,
        transport: http(PUBLIC_RPC[state.chain] ?? PUBLIC_RPC.base),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const contractAddress = receipt.contractAddress ?? "";

      dispatch({ type: "SET_DEPLOYED", contractAddress, txHash: hash });

      if (state.email) {
        fetch("/api/notify-deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: state.email, contractAddress, chain: state.chain, contractType: state.contractType, txHash: hash }),
        }).catch(() => {});
      }

      navigate("/success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deployment failed";
      setDeployError(msg);
      setStep("moonpay"); // go back so user can retry
    }
  }
}

// ── Shared ─────────────────────────────────────────────────────────────────────

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
