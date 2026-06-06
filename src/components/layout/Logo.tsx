import { C, F } from "../../tokens";

const SIZES = {
  sm: { icon: 22, wordFs: 15, gap: 7 },
  md: { icon: 30, wordFs: 20, gap: 10 },
  lg: { icon: 42, wordFs: 28, gap: 14 },
};

// The Y mark as inline SVG — transparent bg, vector-sharp at any size
function YMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M 0 0 L 20 0 L 50 44 L 80 0 L 100 0 L 62 56 L 62 120 L 38 120 L 38 56 Z"
        fill={C.purple}
      />
    </svg>
  );
}

export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { icon, wordFs, gap } = SIZES[size];

  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      <YMark size={icon} />
      <span style={{
        fontSize: wordFs,
        fontWeight: 800,
        fontFamily: F.display,
        color: C.white,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}>
        BYULD
      </span>
    </div>
  );
}
