// A per-user history of builds, so the dashboard can show everything a user has
// created and deployed. Persisted on the SERVER (tied to the account, so it follows
// the user to any device) with a local cache for instant render / offline.
import { apiUrl } from "./api";
import type { BuildPlan, Section } from "../types";

export interface BuildRecord {
  id: string;              // contract address (deployed) — unique per build
  email: string;
  name: string;
  contractType: string;
  chain: string;
  contractAddress: string;
  txHash?: string;
  goal?: string;
  createdAt: number;
  deployedAt: number;
}

const KEY = "byuld_builds";

function readAll(): BuildRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function writeAll(list: BuildRecord[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// All deployed builds for an email, newest first.
export function getDeployedBuilds(email: string): BuildRecord[] {
  return readAll()
    .filter(b => !email || b.email === email)
    .sort((a, b) => (b.deployedAt || 0) - (a.deployedAt || 0));
}

// Record a deploy (upsert by contract address so re-deploys don't duplicate).
export function recordDeploy(rec: Omit<BuildRecord, "id" | "createdAt"> & { createdAt?: number }) {
  if (!rec.contractAddress) return;
  const list = readAll();
  const id = rec.contractAddress;
  const existing = list.find(b => b.id === id);
  const record: BuildRecord = { ...rec, id, createdAt: existing?.createdAt ?? rec.createdAt ?? Date.now() };
  writeAll([record, ...list.filter(b => b.id !== id)]);
}

// ─── Server-backed builds (account-tied, cross-device) ──────────────────────────

export interface ServerBuild {
  email: string;
  buildId: string;
  status: "in_progress" | "deployed";
  name?: string | null;
  goal?: string | null;
  projectName?: string | null;
  contractType?: string | null;
  chain?: string | null;
  buildPlan?: BuildPlan | null;
  sections?: Section[] | null;
  currentSection?: number;
  contractAddress?: string | null;
  txHash?: string | null;
  deployedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

// Save (upsert) a build to the user's account. Fire-and-forget; never throws.
export function saveBuildRemote(build: Partial<ServerBuild> & { email: string; buildId: string }) {
  if (!build.email || !build.buildId) return;
  try {
    fetch(apiUrl("/api/builds/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(build),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

// Load all of a user's builds from their account.
export async function fetchBuildsRemote(email: string): Promise<ServerBuild[]> {
  if (!email) return [];
  try {
    const res = await fetch(apiUrl("/api/builds/list"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      const d = await res.json();
      return Array.isArray(d.builds) ? d.builds : [];
    }
  } catch { /* ignore */ }
  return [];
}
