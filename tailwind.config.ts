import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#1a1a2e",
          panel: "#16213e",
          chat: "#0f1729",
          card: "#1f2a44",
        },
        gold: {
          DEFAULT: "#C6A962",
          dark: "#a08a4f",
          light: "#e0c47e",
        },
        wall: "#3a5a8c",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
