import { C, F, R } from "../../tokens";

// ─── Shapes (mirror /api/admin/metrics → learning + feedbackAnalytics) ──────────

export interface Learning {
  windowKey: string;
  since: number;
  userOverview: { totalUsers: number; activeUsers: number; newUsers: number; returningUsers: number };
  funnel: { key: string; label: string; count: number; dropoffPct: number }[];
  learningMetrics: {
    avgSessionDuration: number; avgIdeTime: number; avgReviewTime: number; avgAuditTime: number;
    avgQuestions: number; avgConcepts: number; avgExplanations: number; avgScreens: number;
    longestSession: { min: number; who: string } | null;
    mostEngagedUser: { who: string; score: number } | null;
    activeOver10: number; activeOver20: number; activeOver30: number;
  };
  projects: { name: string; count: number }[];
  concepts: { concept: string; views: number; uniqueUsers: number; avgTimeSec: number }[];
  returnAnalytics: { returnRatePct: number; avgSessionsPerUser: number; avgProjectsPerUser: number; avgHoursBetweenSessions: number };
  activityFeed: { ts: number; who: string; label: string; type: string; screen: string | null }[];
  sessionsCount: number;
  assistance?: { totalAttempts: number; totalHints: number; totalReveals: number; totalHelpRequests: number; avgAttemptsPerConcept: number; hintRate: number; revealRate: number };
  difficultConcepts?: { concept: string; attempts: number; hints: number; examples: number; explains: number; reveals: number; hintRate: number }[];
  understanding?: { total: number; makesSense: number; needSimpler: number; confusingConcepts: { concept: string; yes: number; simpler: number }[] };
  projectSelections?: { name: string; count: number }[];
}

export interface FeedbackAnalytics {
  total: number; avgUnderstanding: number; avgRating: number;
  wouldUseAgain: Record<string, number>; mostValuable: Record<string, number>;
  improvementRequests: string[]; challenges: string[];
}

export type WindowKey = "72h" | "7d" | "30d" | "all";
const WINDOW_LABELS: Record<WindowKey, string> = { "72h": "Last 72 hours", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" };

// ─── Small building blocks ──────────────────────────────────────────────────────

const card: React.CSSProperties = { padding: "20px 22px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg };
const sectionTitle = (t: string, n?: number | string) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
    <h3 style={{ fontSize: "13px", fontWeight: 700, color: C.white, fontFamily: F.body, letterSpacing: "0.03em", textTransform: "uppercase", margin: 0 }}>{t}</h3>
    {n !== undefined && <span style={{ fontSize: "12px", color: C.textMute, fontFamily: F.mono }}>{n}</span>}
  </div>
);

function Tile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{ padding: "16px 18px", background: accent ? `${C.purple}10` : C.surface2, border: `1px solid ${accent ? C.purple + "44" : C.border}`, borderRadius: R.md }}>
      <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.body, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "7px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 700, fontFamily: F.display, color: accent ? C.purple : C.white, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "10px", color: C.textMute, fontFamily: F.body, marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}

const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// ─── Main ────────────────────────────────────────────────────────────────────

export default function LearningAnalytics({
  learning, feedback, windowKey, onWindow, isMobile,
}: {
  learning: Learning; feedback: FeedbackAnalytics; windowKey: WindowKey; onWindow: (w: WindowKey) => void; isMobile: boolean;
}) {
  const L = learning;
  const m = L.learningMetrics;
  const grid = (cols: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : `repeat(${cols}, 1fr)`, gap: "12px" });
  const hasData = L.sessionsCount > 0 || L.activityFeed.length > 0;

  // Group the activity feed into per-user timelines.
  const byUser = new Map<string, typeof L.activityFeed>();
  for (const e of L.activityFeed) {
    const arr = byUser.get(e.who) || [];
    arr.push(e);
    byUser.set(e.who, arr);
  }
  const userTimelines = [...byUser.entries()]
    .map(([who, evs]) => ({ who, evs: evs.slice(0, 14), last: evs[0]?.ts || 0 }))
    .sort((a, b) => b.last - a.last)
    .slice(0, 12);

  const funnelMax = Math.max(1, ...L.funnel.map(f => f.count));
  const projMax = Math.max(1, ...L.projects.map(p => p.count));

  return (
    <div style={{ marginBottom: "36px" }}>
      {/* Banner header + window selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "18px" }}>
        <div>
          <div style={{ fontSize: "11px", color: C.purple, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: F.body }}>The important section</div>
          <h2 style={{ fontSize: "22px", fontWeight: 700, fontFamily: F.display, color: C.white, margin: "4px 0 0" }}>Learning Analytics</h2>
          <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, margin: "4px 0 0" }}>
            Evidence of understanding & engagement — not just signups. {WINDOW_LABELS[windowKey]} · {L.sessionsCount} sessions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {(Object.keys(WINDOW_LABELS) as WindowKey[]).map(w => (
            <button key={w} onClick={() => onWindow(w)} style={{
              padding: "7px 13px", borderRadius: R.full, cursor: "pointer", fontFamily: F.body, fontSize: "12px", fontWeight: 600,
              background: windowKey === w ? C.purple : C.surface,
              border: `1px solid ${windowKey === w ? C.purple : C.border}`,
              color: windowKey === w ? "#fff" : C.textSec,
            }}>{w === "72h" ? "72h" : w === "7d" ? "7d" : w === "30d" ? "30d" : "All"}</button>
          ))}
        </div>
      </div>

      {!hasData && (
        <div style={{ ...card, marginBottom: "18px", borderStyle: "dashed", textAlign: "center" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: C.white, fontFamily: F.body, marginBottom: "6px" }}>No event data in this window yet</div>
          <div style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6, maxWidth: "520px", margin: "0 auto" }}>
            Event-level instrumentation just shipped — time-per-stage, questions, concepts, audits and return visits accrue as users build from here on.
            Earlier history wasn't captured at this granularity, so it can't be reconstructed. Counts below populate within minutes of real usage.
          </div>
        </div>
      )}

      {/* 1 · User overview */}
      <div style={{ ...card, marginBottom: "14px" }}>
        {sectionTitle("User Overview")}
        <div style={grid(4)}>
          <Tile label="Total users" value={L.userOverview.totalUsers} sub="All time" />
          <Tile label="Active" value={L.userOverview.activeUsers} sub={WINDOW_LABELS[windowKey]} accent />
          <Tile label="New" value={L.userOverview.newUsers} sub={WINDOW_LABELS[windowKey]} />
          <Tile label="Returning" value={L.userOverview.returningUsers} sub=">1 session" />
        </div>
      </div>

      {/* 2 · Funnel */}
      <div style={{ ...card, marginBottom: "14px" }}>
        {sectionTitle("Funnel & Drop-off")}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {L.funnel.map((f, i) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: isMobile ? "120px" : "180px", fontSize: "12px", color: C.textSec, fontFamily: F.body, flexShrink: 0 }}>{f.label}</div>
              <div style={{ flex: 1, height: "24px", background: C.surface2, borderRadius: R.sm, overflow: "hidden", position: "relative" }}>
                <div style={{ height: "100%", width: `${Math.round((f.count / funnelMax) * 100)}%`, minWidth: f.count > 0 ? "2px" : 0, background: i === 0 ? C.mint : C.purple, borderRadius: R.sm, transition: "width 0.4s" }} />
                <span style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: C.white, fontFamily: F.mono, fontWeight: 600 }}>{f.count}</span>
              </div>
              <div style={{ width: "62px", textAlign: "right", fontSize: "11px", fontFamily: F.mono, color: i === 0 ? C.textMute : (f.dropoffPct >= 50 ? C.danger : C.textMute), flexShrink: 0 }}>
                {i === 0 ? "—" : `−${f.dropoffPct}%`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3 · Learning metrics */}
      <div style={{ ...card, marginBottom: "14px" }}>
        {sectionTitle("Learning Metrics")}
        <div style={{ ...grid(4), marginBottom: "12px" }}>
          <Tile label="Avg session" value={`${m.avgSessionDuration}m`} accent />
          <Tile label="Avg IDE time" value={`${m.avgIdeTime}m`} accent />
          <Tile label="Avg review time" value={`${m.avgReviewTime}m`} />
          <Tile label="Avg audit time" value={`${m.avgAuditTime}m`} />
          <Tile label="Avg questions" value={m.avgQuestions} />
          <Tile label="Avg concepts" value={m.avgConcepts} />
          <Tile label="Avg explanations" value={m.avgExplanations} />
          <Tile label="Avg screens" value={m.avgScreens} />
        </div>
        <div style={grid(isMobile ? 2 : 5)}>
          <Tile label="Longest session" value={m.longestSession ? `${m.longestSession.min}m` : "—"} sub={m.longestSession?.who} />
          <Tile label="Most engaged" value={m.mostEngagedUser ? `${m.mostEngagedUser.score}` : "—"} sub={m.mostEngagedUser?.who} />
          <Tile label="Active >10m" value={m.activeOver10} />
          <Tile label="Active >20m" value={m.activeOver20} />
          <Tile label="Active >30m" value={m.activeOver30} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {/* 4 · Projects */}
        <div style={card}>
          {sectionTitle("Most Built Projects", L.projects.length)}
          {L.projects.length === 0 ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>No builds in this window yet.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {L.projects.slice(0, 8).map((p, i) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ width: "18px", fontSize: "12px", color: C.textMute, fontFamily: F.mono }}>{i + 1}</span>
                  <div style={{ width: isMobile ? "90px" : "130px", fontSize: "12px", color: C.textSec, fontFamily: F.body, textTransform: "capitalize", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ flex: 1, height: "8px", background: C.surface2, borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((p.count / projMax) * 100)}%`, background: C.purple, borderRadius: "4px" }} />
                  </div>
                  <span style={{ width: "24px", textAlign: "right", fontSize: "12px", color: C.white, fontFamily: F.mono }}>{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 5 · Concepts */}
        <div style={card}>
          {sectionTitle("Most Viewed Concepts", L.concepts.length)}
          {L.concepts.length === 0 ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>No concept views in this window yet.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Concept", "Views", "Users", "Avg time"].map(h => (
                <th key={h} style={{ textAlign: h === "Concept" ? "left" : "right", fontSize: "10px", color: C.textMute, fontFamily: F.body, fontWeight: 600, padding: "0 0 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {L.concepts.slice(0, 9).map(c => (
                  <tr key={c.concept}>
                    <td style={{ padding: "8px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{c.concept}</td>
                    <td style={{ padding: "8px 0", fontSize: "12px", color: C.white, fontFamily: F.mono, textAlign: "right" }}>{c.views}</td>
                    <td style={{ padding: "8px 0", fontSize: "12px", color: C.textMute, fontFamily: F.mono, textAlign: "right" }}>{c.uniqueUsers}</td>
                    <td style={{ padding: "8px 0", fontSize: "12px", color: C.textMute, fontFamily: F.mono, textAlign: "right" }}>{c.avgTimeSec}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Learning Assistance — attempts, hints, reveals (the assistance ladder) */}
      {L.assistance && (
        <div style={{ ...card, marginBottom: "14px" }}>
          {sectionTitle("Learning Assistance")}
          <div style={{ ...grid(4), marginBottom: L.difficultConcepts && L.difficultConcepts.length ? "16px" : 0 }}>
            <Tile label="Avg attempts / concept" value={L.assistance.avgAttemptsPerConcept || 0} accent />
            <Tile label="Hint usage rate" value={`${Math.round((L.assistance.hintRate || 0) * 100)}%`} sub="hints ÷ attempts" />
            <Tile label="Reveal rate" value={`${Math.round((L.assistance.revealRate || 0) * 100)}%`} sub="answers revealed" />
            <Tile label="Help requests" value={L.assistance.totalHelpRequests || 0} />
          </div>
          {L.difficultConcepts && L.difficultConcepts.length > 0 && (
            <>
              <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "8px" }}>Most difficult concepts</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Concept", "Attempts", "Hints", "Reveals"].map(h => (
                  <th key={h} style={{ textAlign: h === "Concept" ? "left" : "right", fontSize: "10px", color: C.textMute, fontFamily: F.body, fontWeight: 600, padding: "0 0 8px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {L.difficultConcepts.slice(0, 8).map(d => (
                    <tr key={d.concept}>
                      <td style={{ padding: "8px 0", fontSize: "12px", color: C.textSec, fontFamily: F.body }}>{d.concept}</td>
                      <td style={{ padding: "8px 0", fontSize: "12px", color: C.white, fontFamily: F.mono, textAlign: "right" }}>{d.attempts}</td>
                      <td style={{ padding: "8px 0", fontSize: "12px", color: C.textMute, fontFamily: F.mono, textAlign: "right" }}>{d.hints}</td>
                      <td style={{ padding: "8px 0", fontSize: "12px", color: (d.reveals > 0 ? C.danger : C.textMute), fontFamily: F.mono, textAlign: "right" }}>{d.reveals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
        {/* Understanding checks */}
        {L.understanding && (
          <div style={card}>
            {sectionTitle("Understanding Checks", L.understanding.total)}
            <div style={{ ...grid(2), marginBottom: "14px" }}>
              <Tile label="Makes sense" value={L.understanding.makesSense} accent />
              <Tile label="Needed simpler" value={L.understanding.needSimpler} />
            </div>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Concepts people asked to simplify</div>
            {L.understanding.confusingConcepts.length === 0
              ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, margin: 0 }}>—</p>
              : L.understanding.confusingConcepts.slice(0, 6).map(c => (
                <div key={c.concept} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: "12px", fontFamily: F.body }}>
                  <span style={{ color: C.textSec }}>{c.concept}</span>
                  <span style={{ color: C.warn, fontFamily: F.mono }}>{c.simpler}×</span>
                </div>
              ))}
          </div>
        )}

        {/* 6 · Feedback analytics */}
        <div style={card}>
          {sectionTitle("Feedback Analytics", feedback.total)}
          <div style={{ ...grid(3), marginBottom: "14px" }}>
            <Tile label="Understanding" value={feedback.avgUnderstanding ? `${feedback.avgUnderstanding}/5` : "—"} accent />
            <Tile label="Avg rating" value={feedback.avgRating ? `${feedback.avgRating}/5` : "—"} />
            <Tile label="Responses" value={feedback.total} />
          </div>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Would use again</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {["yes", "maybe", "no"].map(k => (
              <span key={k} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, padding: "4px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.full, textTransform: "capitalize" }}>
                {k}: <strong style={{ color: C.white }}>{feedback.wouldUseAgain[k] || 0}</strong>
              </span>
            ))}
          </div>
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Most common improvement requests</div>
          {feedback.improvementRequests.length === 0 ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, margin: 0 }}>—</p> : (
            <ul style={{ margin: "0 0 12px", paddingLeft: "16px" }}>
              {feedback.improvementRequests.slice(0, 5).map((t, i) => <li key={i} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, marginBottom: "3px" }}>{t}</li>)}
            </ul>
          )}
          <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, marginBottom: "6px" }}>Most common challenges</div>
          {feedback.challenges.length === 0 ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body, margin: 0 }}>—</p> : (
            <ul style={{ margin: 0, paddingLeft: "16px" }}>
              {feedback.challenges.slice(0, 5).map((t, i) => <li key={i} style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, marginBottom: "3px" }}>{t}</li>)}
            </ul>
          )}
        </div>

        {/* 7 · Return analytics */}
        <div style={card}>
          {sectionTitle("Return User Analytics")}
          <div style={grid(2)}>
            <Tile label="Return rate" value={`${L.returnAnalytics.returnRatePct}%`} sub="Users with >1 session" accent />
            <Tile label="Sessions / user" value={L.returnAnalytics.avgSessionsPerUser} />
            <Tile label="Projects / user" value={L.returnAnalytics.avgProjectsPerUser} />
            <Tile label="Hrs between sessions" value={L.returnAnalytics.avgHoursBetweenSessions || "—"} sub="Avg gap" />
          </div>
          <p style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body, lineHeight: 1.6, margin: "14px 0 0" }}>
            Coming back after a first session is BYULD's strongest value signal — a user who returns to build again learned enough to want more.
          </p>
        </div>
      </div>

      {/* 8 · Activity feed */}
      <div style={card}>
        {sectionTitle("User Activity Timeline", L.activityFeed.length)}
        {userTimelines.length === 0 ? <p style={{ fontSize: "12px", color: C.textMute, fontFamily: F.body }}>No activity in this window yet.</p> : (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px" }}>
            {userTimelines.map(u => (
              <div key={u.who} style={{ padding: "14px 16px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "12px", color: C.white, fontFamily: F.mono, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.who}</span>
                  <span style={{ fontSize: "10px", color: C.textMute, fontFamily: F.mono }}>{fmtDay(u.last)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {u.evs.map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                      <span style={{ fontSize: "10px", color: C.textMute, fontFamily: F.mono, width: "38px", flexShrink: 0 }}>{fmtTime(e.ts)}</span>
                      <span style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, lineHeight: 1.4 }}>{e.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
