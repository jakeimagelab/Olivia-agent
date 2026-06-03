import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ivory: "#f7f1e7",
        parchment: "#fbf8f1",
        forest: "#183d2f",
        moss: "#6f7e55",
        walnut: "#6b4a32",
        bark: "#3c2a1e",
        ink: "#201b16",
        stone: "#8b8377",
        fog: "#e8e0d4",
        tide: "#5f7480"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"]
      },
      boxShadow: {
        soft: "0 24px 70px rgba(32, 27, 22, 0.11)"
      }
    }
  },
  plugins: []
};

export default config;
