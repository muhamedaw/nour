import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Whole app runs 4% *smaller* than Tailwind's defaults (was 20%
      // smaller; bumped +1.2x here per legibility feedback — still reads
      // slightly tighter than stock Tailwind, no longer oversized-feeling
      // at arm's length but small text was hard to read). Overriding
      // these keys here cascades to every text-* class already used
      // throughout the app instead of editing every component.
      fontSize: {
        xs: "0.72rem",
        sm: "0.84rem",
        base: "0.96rem",
        lg: "1.08rem",
        xl: "1.2rem",
        "2xl": "1.44rem",
        "3xl": "1.8rem",
        "4xl": "2.16rem",
        "5xl": "2.88rem",
        "6xl": "3.6rem",
        "7xl": "4.32rem",
        "8xl": "5.76rem",
        "9xl": "7.68rem",
      },
      colors: {
        // Warm dark-roast neutral ramp — replaces Tailwind's cold `neutral`.
        // 950 = deepest background, 50 = cream primary text.
        espresso: {
          50: "#f5ead9",
          100: "#e5d6bd",
          200: "#cbb494",
          300: "#ab8f71",
          400: "#8a7057",
          500: "#6b543d",
          600: "#52402f",
          700: "#3c2e22",
          800: "#2a1f17",
          900: "#1d1510",
          950: "#140e0a",
        },
        // THE accent — copper/amber, used with intent (CTAs, focus, prices,
        // interactive states). One accent for the whole app, not a
        // different hue per screen/area.
        copper: {
          50: "#fdf0e4",
          100: "#fbdcc2",
          200: "#f4bd97",
          300: "#ec9c6c",
          400: "#e07a3e",
          500: "#c85a1f",
          600: "#a84518",
          700: "#833511",
          800: "#62280d",
          900: "#431b09",
          950: "#2b1206",
        },
        // Busy / alert / destructive — a warm rust-red, not a cold pure red.
        rust: {
          50: "#fdeee9",
          100: "#f9d4c7",
          200: "#f0ac93",
          300: "#e6907a",
          400: "#d66646",
          500: "#bc4526",
          600: "#9c3319",
          700: "#742514",
          800: "#571c11",
          900: "#3d130c",
          950: "#240a06",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "Tahoma", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "Tahoma", "sans-serif"],
        mono: ["var(--font-numeral)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        warm: "0 20px 40px -12px rgb(20 14 10 / 0.6)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
