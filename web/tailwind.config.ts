import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          950: "#07090d",
          900: "#0c0f15",
          800: "#11151c",
          700: "#181d27",
          600: "#222936",
          500: "#3a4252",
        },
        accent: {
          DEFAULT: "#facc15",
          soft: "#fde68a",
        },
        event: {
          kill: "#ff3d3d",
          killed: "#b91c1c",
          botKill: "#fb923c",
          botKilled: "#a855f7",
          loot: "#22d3ee",
          storm: "#ec4899",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(250, 204, 21, 0.25), 0 8px 30px rgba(250, 204, 21, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
