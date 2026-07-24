import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Gold accent palette — white/black chrome, gold for CTAs and
        // highlights (see src/app/layout.tsx for the header treatment).
        // Exact tokens from the premium-SaaS redesign brief.
        brand: {
          50: "#fdf8e9",
          100: "#f7e9b8",
          200: "#E8C75A", // secondary gold
          500: "#C99712", // primary gold
          600: "#C99712",
          700: "#B88708", // hover gold
          800: "#5c4306",
          900: "#3d2c04",
        },
        surface: {
          bg: "#FAFAFA",
          card: "#FFFFFF",
          border: "#ECECEC",
        },
        ink: {
          primary: "#111827",
          secondary: "#6B7280",
        },
      },
      borderRadius: {
        card: "18px",
        control: "14px", // buttons/inputs
        tablecell: "16px",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgba(17, 24, 39, 0.04), 0 4px 16px -4px rgba(17, 24, 39, 0.06)",
        "soft-lg": "0 4px 12px -2px rgba(17, 24, 39, 0.06), 0 12px 32px -8px rgba(17, 24, 39, 0.10)",
        "soft-hover": "0 8px 24px -4px rgba(201, 151, 18, 0.16), 0 2px 8px -2px rgba(17, 24, 39, 0.08)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
