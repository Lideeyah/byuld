import { useState, useEffect, useCallback } from "react";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";

const ADMIN_PASSWORD = "byuld2026";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRecord {
  email: string;
  persona: string | null;
  chain: string;
  contractType: string;
  stage: string;
  tokensUsed: number;
  deployedAt: number;
  contractAddress: string;
  signedUpAt: number;
}

interface Metrics {
  totalUsers: number;
  completedOnboarding: number;
  activeLast24h: number;
  totalDeployments: number;
  dailySignups: number[];         // last 7 days
  recentUsers: UserRecord[];
}

// ─── Read metrics from localStorage ──────────────────────────────────────────
// For MVP: reads the current session only. Production would use Supabase.

function readMetrics(): Metrics {
  const raw = localStorage.getItem("byuld_session");
  const session = raw ? JSON.parse(raw) : null;
  const oneDayMs = 86_400_000;
  const now = Date.now();

  // Real data only — the current browser session. No padding, no fabricated numbers.
  const users: UserRecord[] = session?.email ? [{
    email: session.email,
    persona: session.persona ?? null,
    chain: session.chain ?? "base-sepolia",
    contractType: session.contractType ?? "escrow",
    stage: session.deployedAt ? "deployed" : session.contractType ? "building" : "onboarding",
    tokensUsed: session.tokensUsed ?? 0,
    deployedAt: session.deployedAt ?? 0,
    contractAddress: session.contractAddress ?? "",
    signedUpAt: session.deployedAt || now,
  }] : [];

  return {
    totalUsers: users.length,
    completedOnboarding: users.filter(u => u.persona).length,
    activeLast24h: users.filter(u => now - u.signedUpAt < oneDayMs).length,
    totalDeployments: users.filter(u => !!u.deployedAt).length,
    dailySignups: [],
    recentUsers: users,
  };
}

// ─── Bar chart (pure CSS) ─────────────────────────────────────────────────────

function BarChart({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data, 1);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const today = new Date().getDay();          // 0 = Sun
  const labels = days.map((_, i) => days[(today - 6 + i + 7) % 7]);

  return (
    <div>
      <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "80px" }}>
        {data.map((val, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{
                width: "100%",
                height: `${Math.round((val / max) * 100)}%`,
                minHeight: val > 0 ? "4px" : 0,
                background: i === data.length - 1 ? C.purple : `${C.purple}55`,
                borderRadius: "3px 3px 0 0",
                transition: "height 0.4s ease",
              }} />
            </div>
            <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.mono }}>{labels[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ padding: "20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
      <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: F.display, color: C.white, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "6px" }}>{sub}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(() => {
    setMetrics(readMetrics());
    setLastRefresh(new Date());
  }, []);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!authed) return;
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [authed, refresh]);

  // ── Password gate ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
        <div style={{ width: "100%", maxWidth: "360px" }}>
          <div style={{ textAlign: "center", marginBottom: "40px" }}>
            <Logo size="md" />
            <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, marginTop: "12px" }}>Admin access only</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (password === ADMIN_PASSWORD) setAuthed(true);
                  else setError("Incorrect password.");
                }
              }}
              placeholder="Enter admin password"
              autoFocus
              style={{
                padding: "12px 16px", background: C.surface2,
                border: `1px solid ${error ? C.danger : C.border}`,
                borderRadius: R.md, color: C.white, fontFamily: F.mono,
                fontSize: "14px", outline: "none",
              }}
            />
            {error && <p style={{ fontSize: "12px", color: C.danger, fontFamily: F.body }}>{error}</p>}
            <button
              onClick={() => {
                if (password === ADMIN_PASSWORD) setAuthed(true);
                else setError("Incorrect password.");
              }}
              style={{
                padding: "12px", background: C.purple, border: "none",
                borderRadius: R.md, color: "#fff", fontFamily: F.body,
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Access dashboard →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  // ── Dashboard ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "32px" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
        <Logo size="md" />
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>
            Last updated {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={refresh}
            style={{ padding: "6px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md, color: C.textSec, fontFamily: F.body, fontSize: "12px", cursor: "pointer" }}
          >
            ↻ Refresh
          </button>
          <div style={{ padding: "4px 12px", background: `${C.mint}15`, border: `1px solid ${C.mint}33`, borderRadius: R.full, fontSize: "11px", color: C.mint, fontFamily: F.body, fontWeight: 600 }}>
            Admin
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <StatCard label="Total users" value={metrics.totalUsers} sub="All time" />
        <StatCard label="Completed onboarding" value={metrics.completedOnboarding} sub={`${Math.round(metrics.completedOnboarding / metrics.totalUsers * 100)}% conversion`} />
        <StatCard label="Active last 24h" value={metrics.activeLast24h} sub="Unique sessions" />
        <StatCard label="Contracts deployed" value={metrics.totalDeployments} sub="All chains" />
      </div>

      {/* Chart + recent users */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", marginBottom: "32px" }}>
        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          {metrics.dailySignups.length > 0 ? (
            <BarChart data={metrics.dailySignups} label="Daily signups — last 7 days" />
          ) : (
            <div>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>Daily signups</div>
              <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6 }}>
                Historical analytics need a connected database. This MVP reads only the current browser session.
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
            Recent users
          </div>

          {metrics.recentUsers.length === 0 ? (
            <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>No users yet — data will appear once people sign up.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Email", "Persona", "Contract type", "Stage", "Tokens used"].map(h => (
                    <th key={h} style={{ textAlign: "left", fontSize: "11px", color: C.textMute, fontFamily: F.body, fontWeight: 600, padding: "4px 8px 12px 0", borderBottom: `1px solid ${C.border}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.recentUsers.map((u, i) => (
                  <tr key={i}>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.mono }}>{u.email}</td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{u.persona ?? "—"}</td>
                    <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{u.contractType || "—"}</td>
                    <td style={{ padding: "10px 8px 10px 0" }}>
                      <span style={{
                        fontSize: "10px", fontWeight: 600, fontFamily: F.body,
                        padding: "2px 8px", borderRadius: R.full,
                        background: u.stage === "deployed" ? `${C.mint}18` : `${C.purple}18`,
                        color: u.stage === "deployed" ? C.mint : C.purple,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}>
                        {u.stage}
                      </span>
                    </td>
                    <td style={{ padding: "10px 0", fontSize: "12px", color: C.textMute, fontFamily: F.mono }}>{u.tokensUsed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Padded with placeholder rows to show the table is live */}
          <div style={{ marginTop: "16px", padding: "12px 16px", background: C.surface2, borderRadius: R.md, fontSize: "12px", color: C.textMute, fontFamily: F.body }}>
            📌 MVP: reads current browser session. Connect Supabase for multi-user tracking.
          </div>
        </div>
      </div>

      {/* Deployed contracts */}
      {metrics.recentUsers.filter(u => u.contractAddress).length > 0 && (
        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>
            Deployed contracts
          </div>
          {metrics.recentUsers.filter(u => u.contractAddress).map((u, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontFamily: F.mono, color: C.purple }}>{u.contractAddress}</div>
                <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginTop: "2px" }}>{u.contractType} · {u.chain}</div>
              </div>
              <a
                href={`https://${u.chain === "base" ? "basescan.org" : u.chain === "polygon" ? "polygonscan.com" : "etherscan.io"}/address/${u.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textDecoration: "none" }}
              >
                View on explorer →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
