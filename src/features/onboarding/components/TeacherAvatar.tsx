/**
 * Illustrated (not photographic) teacher avatars. All five share one
 * structural template — same frame, same face shape, same line weight —
 * and differ only in the parameters below (hair, accessory, expression,
 * accent color). This guarantees the "one consistent visual style"
 * requirement by construction rather than by hand-matching five separate
 * drawings later.
 */

type Expression = "warm" | "confident" | "bright" | "serious" | "focused";

interface AvatarConfig {
  ringColor: string;
  hair: React.ReactNode;
  accessory?: React.ReactNode;
  expression: Expression;
}

const FACE_COLOR = "#F4CBA0";
const HAIR_COLORS = {
  anna: "#C98A4B",
  james: "#2E2A26",
  sofia: "#5B3A24",
  alex: "#3B3B3D",
  mary: "#4A3428",
} as const;

const AVATAR_CONFIG: Record<string, AvatarConfig> = {
  anna: {
    ringColor: "#F5D9C6",
    expression: "warm",
    hair: (
      <path
        d="M18 26c0-9 6-15 14-15s14 6 14 15c0 3-1 5-1 5H19s-1-2-1-5Z"
        fill={HAIR_COLORS.anna}
      />
    ),
  },
  james: {
    ringColor: "#C7CCEB",
    expression: "confident",
    hair: (
      <path
        d="M17 24c0-8 6-13 15-13s15 5 15 13v2H17v-2Z"
        fill={HAIR_COLORS.james}
      />
    ),
    accessory: (
      <path
        d="M28 46h8l-2 8h-4l-2-8Z"
        fill="#4F46E5"
      />
    ),
  },
  sofia: {
    ringColor: "#F6DFA6",
    expression: "bright",
    hair: (
      <path
        d="M16 27c-1-10 6-17 16-17s17 7 16 17c-1 4-3 5-3 5s1-6-3-8c-2 5-6 3-9 1-3 2-8 4-11-1-3 2-3 8-3 8s-2-1-3-5Z"
        fill={HAIR_COLORS.sofia}
      />
    ),
    accessory: <circle cx="45" cy="34" r="1.6" fill="#E8A33D" />,
  },
  alex: {
    ringColor: "#CBD3D8",
    expression: "serious",
    hair: (
      <path
        d="M18 25c0-8 6-12 14-12s14 4 14 12v1H18v-1Z"
        fill={HAIR_COLORS.alex}
      />
    ),
  },
  mary: {
    ringColor: "#B9E3DE",
    expression: "focused",
    hair: (
      <>
        <path
          d="M17 25c0-9 6-14 15-14s15 5 15 14v1H17v-1Z"
          fill={HAIR_COLORS.mary}
        />
        <circle cx="32" cy="14" r="4" fill={HAIR_COLORS.mary} />
      </>
    ),
    accessory: (
      <g stroke="#2B2B2B" strokeWidth="1.4" fill="none">
        <circle cx="26" cy="32" r="4.2" />
        <circle cx="38" cy="32" r="4.2" />
        <path d="M30.2 32h1.6" />
      </g>
    ),
  },
};

function Mouth({ expression }: { expression: Expression }) {
  switch (expression) {
    case "warm":
      return <path d="M25 40c2 2.5 10 2.5 12 0" stroke="#7A4A2A" strokeWidth="1.6" strokeLinecap="round" fill="none" />;
    case "bright":
      return <path d="M24 39c3 3.5 11 3.5 14 0" stroke="#7A4A2A" strokeWidth="1.8" strokeLinecap="round" fill="none" />;
    case "confident":
      return <path d="M26 40h10" stroke="#5A3A22" strokeWidth="1.6" strokeLinecap="round" />;
    case "serious":
      return <path d="M26 40.5h10" stroke="#5A3A22" strokeWidth="1.6" strokeLinecap="round" />;
    case "focused":
      return <path d="M26 40c2 1.4 8 1.4 10 0" stroke="#5A3A22" strokeWidth="1.6" strokeLinecap="round" fill="none" />;
    default:
      return null;
  }
}

function Brows({ expression }: { expression: Expression }) {
  if (expression === "serious") {
    return (
      <g stroke="#2B2B2B" strokeWidth="1.6" strokeLinecap="round">
        <path d="M23 29.5 27 28" />
        <path d="M41 29.5 37 28" />
      </g>
    );
  }
  return (
    <g stroke="#5A3A22" strokeWidth="1.4" strokeLinecap="round">
      <path d="M23 28.5 27 27.5" />
      <path d="M41 28.5 37 27.5" />
    </g>
  );
}

export interface TeacherAvatarProps {
  teacherId: string;
  size?: number;
}

export function TeacherAvatar({ teacherId, size = 48 }: TeacherAvatarProps) {
  const config = AVATAR_CONFIG[teacherId];

  if (!config) {
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="32" fill={config.ringColor} />
      <ellipse cx="32" cy="34" rx="13" ry="15" fill={FACE_COLOR} />
      <Brows expression={config.expression} />
      <circle cx="27" cy="33" r="1.6" fill="#2B2B2B" />
      <circle cx="37" cy="33" r="1.6" fill="#2B2B2B" />
      <Mouth expression={config.expression} />
      {config.hair}
      {config.accessory}
    </svg>
  );
}
