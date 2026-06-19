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
export async function resolveAuthDestination(
  email: string,
  localPersona: string | null,
): Promise<AuthDestination> {
  const e = (email || "").trim();
  if (e) {
    try {
      const res = await fetch(apiUrl("/api/user-status"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.returning) {
          return { path: "/dashboard", persona: d.persona ?? localPersona ?? null, experienceLevel: d.experienceLevel ?? null };
        }
        return { path: "/onboarding/persona", persona: null, experienceLevel: null };
      }
    } catch {
      /* fall through to local knowledge */
    }
  }
  return { path: localPersona ? "/dashboard" : "/onboarding/persona", persona: localPersona, experienceLevel: null };
}
