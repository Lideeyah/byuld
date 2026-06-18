import { ReactNode } from "react";
import { AlertTriangle, XCircle, CheckCircle2, Info } from "lucide-react";
import { C, F, R } from "../../tokens";

type Level = "warn" | "danger" | "success" | "info";

const LEVELS: Record<Level, { color: string; Icon: typeof Info; bg: string }> = {
  warn:    { color: C.warn,   Icon: AlertTriangle, bg: "rgba(245,166,35,0.08)"  },
  danger:  { color: C.danger, Icon: XCircle,       bg: "rgba(255,90,90,0.08)"   },
  success: { color: C.mint,   Icon: CheckCircle2,  bg: "rgba(0,212,170,0.08)"   },
  info:    { color: C.purple, Icon: Info,          bg: "rgba(123,92,240,0.08)"  },
};

interface Props {
  level?: Level;
  title: string;
  body?: ReactNode;
}

export default function SecurityAlert({ level = "warn", title, body }: Props) {
  const l = LEVELS[level];
  return (
    <div style={{
      padding: "12px 16px",
      background: l.bg,
      border: `1px solid ${l.color}22`,
      borderLeft: `3px solid ${l.color}`,
      borderRadius: R.md,
      display: "flex",
      gap: "12px",
      alignItems: "flex-start",
    }}>
      <span style={{ color: l.color, flexShrink: 0, marginTop: "1px", display: "flex" }}><l.Icon size={16} /></span>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: l.color, fontFamily: F.body, marginBottom: body ? "4px" : 0 }}>
          {title}
        </div>
        {body && (
          <div style={{ fontSize: "12px", color: C.textSec, fontFamily: F.body, lineHeight: 1.55 }}>
            {body}
          </div>
        )}
      </div>
    </div>
  );
}
