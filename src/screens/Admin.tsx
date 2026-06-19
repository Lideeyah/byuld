import { useState, useEffect, useCallback } from "react";
import { C, F, R } from "../tokens";
import Logo from "../components/layout/Logo";
import { useIsMobile } from "../hooks/useIsMobile";
import { apiUrl } from "../lib/api";
import LearningAnalytics, { type Learning, type FeedbackAnalytics, type WindowKey } from "./admin/LearningAnalytics";

// The admin password is NOT stored in the client. The server validates it (against
// the ADMIN_PASSWORD env var), so the secret never ships in the frontend bundle.

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

interface WaitlistEntry {
  name: string;
  email: string;
  role: string;
  challenge: string;
  at: number;
}

interface FeedbackEntry {
  kind: string;
  email: string;
  experienceLevel: string | null;
  contractType: string | null;
  rating: number | null;
  understanding: number | null;
  wouldUseAgain: string | null;
  mostValuable: string | null;
  confused: string;
  learned: string;
  issue: string;
  improve: string;
  at: number;
}

interface Metrics {
  totalUsers: number;
  completedOnboarding: number;
  activeLast24h: number;
  totalDeployments: number;
  dailySignups: number[];         // last 7 days
  recentUsers: UserRecord[];
  waitlist: WaitlistEntry[];
  experienceDistribution: Record<string, number>;
  waitlistRoles: Record<string, number>;
  feedbackCount: number;
  feedbackStats: { avgRating: number; avgUnderstanding: number; wouldUseAgain: Record<string, number>; mostValuable: Record<string, number> };
  feedback: FeedbackEntry[];
  learning: Learning | null;
  feedbackAnalytics: FeedbackAnalytics | null;
}

// ─── Read metrics from the backend (real, cross-user) ─────────────────────────
// The server tracks every user/deploy; this fetches them (password-gated). Falls
// back to the current browser session if the API is unreachable.

function localSessionUser(): UserRecord | null {
  try {
    const raw = localStorage.getItem("byuld_session");
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.email) return null;
    return {
      email: session.email,
      persona: session.persona ?? null,
      chain: session.chain ?? "sepolia",
      contractType: session.contractType ?? "escrow",
      stage: session.deployedAt ? "deployed" : session.contractType ? "building" : "onboarding",
      tokensUsed: session.tokensUsed ?? 0,
      deployedAt: session.deployedAt ?? 0,
      contractAddress: session.contractAddress ?? "",
      signedUpAt: session.deployedAt || Date.now(),
    };
  } catch { return null; }
}

async function fetchMetrics(password: string, window: WindowKey): Promise<Metrics> {
  const now = Date.now();
  const oneDayMs = 86_400_000;
  let users: UserRecord[] = [];
  let waitlist: WaitlistEntry[] = [];
  const extra = {
    experienceDistribution: {} as Record<string, number>,
    waitlistRoles: {} as Record<string, number>,
    feedbackCount: 0,
    feedbackStats: { avgRating: 0, avgUnderstanding: 0, wouldUseAgain: {} as Record<string, number>, mostValuable: {} as Record<string, number> },
    feedback: [] as FeedbackEntry[],
    learning: null as Learning | null,
    feedbackAnalytics: null as FeedbackAnalytics | null,
  };
  try {
    const res = await fetch(apiUrl("/api/admin/metrics"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, window }),
    });
    if (res.ok) {
      const data = await res.json();
      waitlist = data.waitlist ?? [];
      extra.experienceDistribution = data.experienceDistribution ?? {};
      extra.waitlistRoles = data.waitlistRoles ?? {};
      extra.feedbackCount = data.feedbackCount ?? 0;
      extra.feedbackStats = data.feedbackStats ?? extra.feedbackStats;
      extra.feedback = data.feedback ?? [];
      extra.learning = data.learning ?? null;
      extra.feedbackAnalytics = data.feedbackAnalytics ?? null;
      users = (data.recentUsers ?? []).map((u: any) => ({
        email: u.email ?? "—",
        persona: u.persona ?? null,
        chain: u.chain ?? "sepolia",
        contractType: u.contractType ?? "",
        stage: u.stage ?? "onboarding",
        tokensUsed: u.tokensUsed ?? 0,
        deployedAt: u.deployedAt ?? 0,
        contractAddress: u.contractAddress ?? "",
        signedUpAt: u.signedUpAt ?? u.lastSeen ?? now,
      }));
    }
  } catch { /* fall through to local */ }

  // Always include the current browser session if it isn't already in the list.
  const me = localSessionUser();
  if (me && !users.some(u => u.email === me.email)) users.unshift(me);

  return {
    totalUsers: users.length,
    completedOnboarding: users.filter(u => u.persona).length,
    activeLast24h: users.filter(u => now - u.signedUpAt < oneDayMs).length,
    totalDeployments: users.filter(u => u.stage === "deployed" || !!u.contractAddress).length,
    dailySignups: [],
    recentUsers: users,
    waitlist,
    ...extra,
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
  const [window, setWindow] = useState<WindowKey>("72h");
  const isMobile = useIsMobile();

  const [checking, setChecking] = useState(false);

  // Validate the password against the server (the secret lives only in the env var).
  const tryAuth = async () => {
    if (checking) return;
    setChecking(true); setError("");
    try {
      const res = await fetch(apiUrl("/api/admin/metrics"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.status === 401) { setError("Incorrect password."); }
      else if (!res.ok) { setError("Couldn't reach the server. Try again."); }
      else { setAuthed(true); }
    } catch { setError("Couldn't reach the server. Try again."); }
    setChecking(false);
  };

  const refresh = useCallback(async () => {
    const m = await fetchMetrics(password, window);
    setMetrics(m);
    setLastRefresh(new Date());
  }, [password, window]);

  // Auto-refresh every 60 seconds (and immediately when the window changes).
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
              onKeyDown={e => { if (e.key === "Enter") tryAuth(); }}
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
              onClick={tryAuth}
              disabled={checking}
              style={{
                padding: "12px", background: C.purple, border: "none",
                borderRadius: R.md, color: "#fff", fontFamily: F.body,
                fontSize: "14px", fontWeight: 600, cursor: checking ? "default" : "pointer",
                opacity: checking ? 0.7 : 1,
              }}
            >
              {checking ? "Checking…" : "Access dashboard →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Don't blank the screen while the first fetch is in flight — show the shell.
  if (!metrics) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px" }}>
        <Logo size="md" />
        <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>Loading dashboard…</p>
      </div>
    );
  }

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

      {/* Learning Analytics — the most important section (understanding, not vanity). */}
      {metrics.learning && metrics.feedbackAnalytics && (
        <LearningAnalytics
          learning={metrics.learning}
          feedback={metrics.feedbackAnalytics}
          windowKey={window}
          onWindow={setWindow}
          isMobile={isMobile}
        />
      )}

      <div style={{ height: "1px", background: C.border, margin: "0 0 28px" }} />
      <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>Overview &amp; raw records</div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "16px", marginBottom: "32px" }}>
        <StatCard label="Total users" value={metrics.totalUsers} sub="All time" />
        <StatCard label="Completed onboarding" value={metrics.completedOnboarding} sub={`${metrics.totalUsers ? Math.round(metrics.completedOnboarding / metrics.totalUsers * 100) : 0}% conversion`} />
        <StatCard label="Active last 24h" value={metrics.activeLast24h} sub="Unique sessions" />
        <StatCard label="Contracts deployed" value={metrics.totalDeployments} sub="All chains" />
      </div>

      {/* Chart + recent users */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: "16px", marginBottom: "32px" }}>
        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          {metrics.dailySignups.length > 0 ? (
            <BarChart data={metrics.dailySignups} label="Daily signups — last 7 days" />
          ) : (
            <div>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>Daily signups</div>
              <div style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6 }}>
                Per-day history needs a database. Live totals and the user list below are tracked server-side.
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
            Live: tracked server-side across all users. Set DATABASE_URL on the server for storage that survives redeploys.
          </div>
        </div>
      </div>

      {/* Experience-level distribution + feedback summary */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "32px" }}>
        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>Experience levels</div>
          {Object.keys(metrics.experienceDistribution).length === 0 ? (
            <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>No onboarding data yet.</p>
          ) : (
            (["founder", "student", "developer", "expert"] as const).map(k => {
              const labels: Record<string, string> = { founder: "Non-Technical Founder", student: "Student", developer: "Developer", expert: "Experienced Web3 Builder" };
              const n = metrics.experienceDistribution[k] || 0;
              const max = Math.max(1, ...Object.values(metrics.experienceDistribution));
              return (
                <div key={k} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{labels[k]}</span>
                    <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.mono }}>{n}</span>
                  </div>
                  <div style={{ height: "5px", background: C.surface2, borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((n / max) * 100)}%`, background: C.purple, borderRadius: "3px" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "16px" }}>Feedback summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            {[
              { label: "Responses", value: metrics.feedbackCount },
              { label: "Avg rating", value: metrics.feedbackStats.avgRating ? `${metrics.feedbackStats.avgRating}/5` : "—" },
              { label: "Avg understanding", value: metrics.feedbackStats.avgUnderstanding ? `${metrics.feedbackStats.avgUnderstanding}/5` : "—" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.body, marginTop: "5px" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Would use again</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            {["yes", "maybe", "no"].map(k => (
              <span key={k} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, padding: "4px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.full, textTransform: "capitalize" }}>
                {k}: <strong style={{ color: C.white }}>{metrics.feedbackStats.wouldUseAgain[k] || 0}</strong>
              </span>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Most valuable</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {Object.keys(metrics.feedbackStats.mostValuable).length === 0
              ? <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>—</span>
              : Object.entries(metrics.feedbackStats.mostValuable).map(([k, v]) => (
                <span key={k} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, padding: "4px 10px", background: `${C.purple}12`, border: `1px solid ${C.purple}33`, borderRadius: R.full }}>{k}: <strong style={{ color: C.white }}>{v as number}</strong></span>
              ))}
          </div>
        </div>
      </div>

      {/* Feedback responses (learning outcomes + suggestions) */}
      <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em" }}>Feedback responses</div>
          <span style={{ fontSize: "12px", color: C.mint, fontFamily: F.body, fontWeight: 600 }}>{metrics.feedback.length} total</span>
        </div>
        {metrics.feedback.length === 0 ? (
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>No feedback yet — responses appear here after users finish or use the feedback button.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {metrics.feedback.slice(0, 40).map((f, i) => (
              <div key={i} style={{ padding: "14px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: R.full, textTransform: "uppercase", letterSpacing: "0.05em", background: f.kind === "quick" ? `${C.warn}18` : `${C.mint}18`, color: f.kind === "quick" ? C.warn : C.mint }}>{f.kind}</span>
                  {f.rating ? <span style={{ fontSize: "12px", color: C.warn, fontFamily: F.body }}>{"★".repeat(f.rating)}</span> : null}
                  {f.understanding ? <span style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>understanding {f.understanding}/5</span> : null}
                  {f.wouldUseAgain ? <span style={{ fontSize: "11px", color: C.textSec, fontFamily: F.body }}>· would use: {f.wouldUseAgain}</span> : null}
                  {f.mostValuable ? <span style={{ fontSize: "11px", color: C.textSec, fontFamily: F.body }}>· valued: {f.mostValuable}</span> : null}
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: C.textMute, fontFamily: F.mono }}>{f.email || "anon"}</span>
                </div>
                {f.learned && <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, marginBottom: "4px" }}><span style={{ color: C.mint }}>Now understands:</span> {f.learned}</div>}
                {f.confused && <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, marginBottom: "4px" }}><span style={{ color: C.warn }}>Confused/improve:</span> {f.confused}</div>}
                {f.issue && <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, marginBottom: "4px" }}><span style={{ color: C.warn }}>Issue:</span> {f.issue}</div>}
                {f.improve && <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body }}><span style={{ color: C.purple }}>Would improve:</span> {f.improve}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Waitlist signups */}
      <div style={{ padding: "24px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg, marginBottom: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Waitlist signups
          </div>
          <span style={{ fontSize: "12px", color: C.mint, fontFamily: F.body, fontWeight: 600 }}>{metrics.waitlist.length} total</span>
        </div>
        {metrics.waitlist.length === 0 ? (
          <p style={{ fontSize: "13px", color: C.textMute, fontFamily: F.body }}>No signups yet — they'll appear here when people request early access.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Email", "Role", "Biggest AI challenge", "When"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: "11px", color: C.textMute, fontFamily: F.body, fontWeight: 600, padding: "4px 8px 12px 0", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.waitlist.map((w, i) => (
                <tr key={i}>
                  <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.white, fontFamily: F.body, whiteSpace: "nowrap" }}>{w.name || "—"}</td>
                  <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.mono }}>{w.email}</td>
                  <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{w.role || "—"}</td>
                  <td style={{ padding: "10px 8px 10px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body, maxWidth: "320px" }}>{w.challenge || "—"}</td>
                  <td style={{ padding: "10px 0", fontSize: "11px", color: C.textMute, fontFamily: F.mono, whiteSpace: "nowrap" }}>{w.at ? new Date(w.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
