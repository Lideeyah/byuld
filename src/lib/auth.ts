import { apiUrl } from "./api";

export interface AuthDestination {
  path: string;
  persona: string | null;
  experienceLevel: string | null;
}

// Decide where to send a user immediately after they sign in.
//
// THE RULE (deliberately simple so a returning user can NEVER be trapped in
// onboarding): the dashboard is the default for everyone. We send a user through
// onboarding ONLY when they are a genuinely brand-new account that we don't
// recognise from any signal — Privy says it's a new account (`isNewUser === true`),
// AND the server has no record of them, AND there's no local persona.
//
// `isNewUser` comes from Privy's email-login callback (authoritative). When it's
// unavailable (session restore / magic-link), it's left undefined and we default to
// the dashboard — a session that restored is, by definition, a returning one.
export async function resolveAuthDestination(
  email: string,
  localPersona: string | null,
  opts: { isNewUser?: boolean } = {},
): Promise<AuthDestination> {
  const e = (email || "").trim();
  let serverReturning = false;
  let serverPersona: string | null = null;
  let serverLevel: string | null = null;

  if (e) {
    // Hard timeout: this runs right after sign-in, and a cold/asleep backend must
    // never hang the redirect. If it's slow we just route on local knowledge.
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
        serverReturning = !!d.returning;
        serverPersona = d.persona ?? null;
        serverLevel = d.experienceLevel ?? null;
      }
    } catch {
      /* timed out or unreachable — treat as unknown, default to dashboard */
    } finally {
      clearTimeout(timer);
    }
  }

  // Onboarding only for a truly new, unrecognised account.
  if (opts.isNewUser === true && !serverReturning && !localPersona) {
    return { path: "/onboarding/persona", persona: null, experienceLevel: null };
  }
  // Everyone else → dashboard (hydrate persona/level from the server when we have it).
  return { path: "/dashboard", persona: serverPersona ?? localPersona ?? null, experienceLevel: serverLevel ?? null };
}
