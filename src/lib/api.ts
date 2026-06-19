// Where the API lives.
//
// In production the frontend (Vercel) and API (Render) are separate hosts.
// vercel.json rewrites /api/* to Render, but Vercel's edge proxy times out on
// slow upstream responses — and our AI endpoints are slow: build-plan generation
// runs ~40-60s, and the very first review after Render wakes from a cold start
// can take ~50s. Those exceed the proxy's limit, so users saw "Network error"
// and "couldn't reach the reviewer" even though Render was answering fine.
//
// Fix: in production, call Render directly (CORS is open server-side) so only the
// browser's generous timeout applies — no edge proxy in the path. In dev, BASE is
// empty and requests stay relative, hitting the Vite proxy → localhost:3001.
const BASE = import.meta.env.PROD ? "https://byuld.onrender.com" : "";

export const apiUrl = (path: string) => `${BASE}${path}`;
