// Learning-analytics client.
//
// BYULD's thesis is understanding, not output — so we measure how people move
// through the product: time per stage, questions asked, concepts viewed, audits
// read, return visits. Every call here is fire-and-forget and wrapped so analytics
// can never throw into the UI. Events are stamped with a per-tab sessionId; the
// server stitches sessions to emails to detect return visits.
import { useEffect } from "react";
import { apiUrl } from "./api";

const SID_KEY = "byuld_sid";

function sessionId(): string {
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) {
      s = "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(SID_KEY, s);
    }
    return s;
  } catch {
    return "s_anon";
  }
}

let currentEmail: string | null = null;
/** Attach the signed-in email to subsequent events (call when it becomes known). */
export function setAnalyticsUser(email: string | null) {
  currentEmail = email && email.trim() ? email.trim() : null;
}

export interface EventProps {
  screen?: string;
  stage?: string;
  durationMs?: number;
  concept?: string;
  project?: string;
  role?: string;
}

function payloadFor(type: string, props: EventProps) {
  return { type, ts: Date.now(), sessionId: sessionId(), email: currentEmail, ...props };
}

/** Send an event now. keepalive lets it survive an in-flight navigation. */
export function track(type: string, props: EventProps = {}) {
  try {
    fetch(apiUrl("/api/event"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFor(type, props)),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never throw */
  }
}

/** Send during page unload — sendBeacon is the most reliable path there. */
export function trackBeacon(type: string, props: EventProps = {}) {
  try {
    const body = JSON.stringify(payloadFor(type, props));
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl("/api/event"), new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(apiUrl("/api/event"), { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Convenience emitters ──────────────────────────────────────────────────────
export const trackStage = (stage: string, props: EventProps = {}) => track("stage", { stage, ...props });
export const trackQuestion = (props: EventProps = {}) => track("question", props);
export const trackConcept = (concept: string, durationMs?: number) => track("concept_view", { concept, durationMs });
export const trackExplanation = (props: EventProps = {}) => track("explanation_view", props);
export const trackAudit = (durationMs?: number) => track("audit_view", { screen: "audit", durationMs });
export const trackSessionStart = () => track("session_start");

/**
 * Measure foreground time on a screen. Fires `screen_time` (durationMs) on
 * unmount / tab-hide, and optionally a funnel `stage` event on enter. Hidden time
 * is excluded; the server sums repeated flushes, so it stays accurate across
 * tab-switches. Sub-second flickers are ignored.
 */
export function useScreenTime(screen: string, opts?: { stage?: string }) {
  const stage = opts?.stage;
  useEffect(() => {
    if (stage) trackStage(stage, { screen });
    let enter: number | null = Date.now();
    const flush = (beacon: boolean) => {
      if (enter == null) return;
      const dur = Date.now() - enter;
      enter = null;
      if (dur < 1000) return;
      (beacon ? trackBeacon : track)("screen_time", { screen, durationMs: dur, stage });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush(true);
      else enter = Date.now();
    };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      flush(false);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
}
