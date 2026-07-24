import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Gold accent palette — white/black chrome, gold for CTAs and
        // highlights (see src/app/layout.tsx for the header treatment).
        brand: {
          50: "#fdf8e9",
          100: "#f7e9b8",
          500: "#c9a227",
          600: "#b8860b",
          700: "#8a6508",
          800: "#5c4306",
          900: "#3d2c04",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
