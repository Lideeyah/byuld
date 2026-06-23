import { apiUrl } from "./api";

export interface AuthDestination {
  path: string;
  persona: string | null;
  experienceLevel: string | null;
}

// Decide where to send a user immediately after they sign in.
//
// The source of truth is the server: if their email is already a Byuld user, they
// have onboarded before → go straight to the dashboard. New emails → onboarding.
// This is what makes returning users on a fresh browser/device skip onboarding
// (localStorage is per-device and empty for them). Falls back to local session
// knowledge only if the server can't be reached.
// `priorAccount` = this person has authenticated with Byuld before (a returning
// Privy account), even if they never finished onboarding. Such users go to the
// dashboard too — only a genuinely first-time email is sent through onboarding.
export async function resolveAuthDestination(
  email: string,
  localPersona: string | null,
  priorAccount = false,
): Promise<AuthDestination> {
  const e = (email || "").trim();
  if (e) {
    // Hard timeout: this runs right after sign-in, and a cold/asleep backend must
    // never hang the redirect. If it's slow, fall back to local routing instantly.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(apiUrl("/api/user-status"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const d = await res.json();
        if (d.returning) {
          return { path: "/dashboard", persona: d.persona ?? localPersona ?? null, experienceLevel: d.experienceLevel ?? null };
        }
        // Not in our records, but a returning Privy account → still skip onboarding.
        if (priorAccount) return { path: "/dashboard", persona: localPersona, experienceLevel: null };
        return { path: "/onboarding/persona", persona: null, experienceLevel: null };
      }
    } catch {
      /* timed out or unreachable — fall through to local knowledge */
    } finally {
      clearTimeout(timer);
    }
  }
  if (priorAccount) return { path: "/dashboard", persona: localPersona, experienceLevel: null };
  return { path: localPersona ? "/dashboard" : "/onboarding/persona", persona: localPersona, experienceLevel: null };
}
