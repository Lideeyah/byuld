import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { LayoutDashboard, Plus, Code2, LogOut, Sparkles } from "lucide-react";
import { C, F, R } from "../../tokens";
import { useApp } from "../../context/AppContext";

// Account / navigation menu. Lives in the IDE top bar and on the dashboard so the
// user can always reach their dashboard, start a new build, or log out.
export default function AccountMenu() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { logout } = usePrivy();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initial = (state.email || "?").charAt(0).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const go = (path: string) => { setOpen(false); navigate(path); };

  const handleLogout = async () => {
    setOpen(false);
    try { await logout(); } catch { /* Privy may not be initialised in some envs */ }
    try { localStorage.removeItem("byuld_session"); sessionStorage.removeItem("byuld_demo"); } catch { /* ignore */ }
    // Full reload so AppContext resets to a clean, unauthenticated state.
    window.location.href = "/";
  };

  const item: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: "10px", width: "100%",
    padding: "9px 12px", background: "none", border: "none", textAlign: "left",
    fontSize: "13px", color: C.textSec, fontFamily: F.body, cursor: "pointer", borderRadius: R.md,
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        style={{
          width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
          background: `${C.purple}22`, border: `1px solid ${C.purple}44`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "13px", color: C.purple, fontWeight: 700, cursor: "pointer",
        }}
      >
        {initial}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "40px", right: 0, width: "220px", zIndex: 1000,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.lg,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)", padding: "6px", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: "4px" }}>
            <div style={{ fontSize: "11px", color: C.textMute, fontFamily: F.body }}>Signed in as</div>
            <div style={{ fontSize: "13px", color: C.white, fontFamily: F.body, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {state.email || "Guest"}
            </div>
          </div>

          <button style={item} onClick={() => go("/dashboard")}
            onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <LayoutDashboard size={15} /> My dashboard
          </button>

          <button style={item} onClick={() => go("/onboarding/goal")}
            onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <Plus size={15} /> New build
          </button>

          {state.contractAddress && (
            <button style={item} onClick={() => go("/build")}
              onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}>
              <Code2 size={15} /> Back to editor
            </button>
          )}

          <div style={{ height: "1px", background: C.border, margin: "4px 0" }} />

          {/* Beginner mode — plainest explanations everywhere, one toggle */}
          <button style={item} onClick={() => dispatch({ type: "SET_BEGINNER_MODE", on: !state.beginnerMode })}
            onMouseEnter={e => (e.currentTarget.style.background = C.surface2)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <Sparkles size={15} color={state.beginnerMode ? C.purple : C.textSec} />
            <span style={{ flex: 1 }}>Beginner mode</span>
            <span style={{ width: "32px", height: "18px", borderRadius: R.full, flexShrink: 0, background: state.beginnerMode ? C.purple : C.surface2, border: `1px solid ${state.beginnerMode ? C.purple : C.border}`, position: "relative", transition: "all 0.15s" }}>
              <span style={{ position: "absolute", top: "2px", left: state.beginnerMode ? "16px" : "2px", width: "12px", height: "12px", borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
            </span>
          </button>
          <div style={{ padding: "0 12px 8px 37px", fontSize: "11px", color: C.textMute, fontFamily: F.body, lineHeight: 1.4 }}>
            Plain-language explanations, more analogies.
          </div>

          <div style={{ height: "1px", background: C.border, margin: "4px 0" }} />

          <button style={{ ...item, color: C.danger }} onClick={handleLogout}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.danger}14`)}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
