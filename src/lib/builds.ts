// A lightweight per-user history of builds, so the dashboard can show everything a
// user has created and deployed (not just the current session). Stored locally and
// keyed by email; deployed builds are appended when a deploy succeeds.

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
