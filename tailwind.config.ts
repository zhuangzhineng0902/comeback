import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1f2937",
        paper: "#f8fafc",
        mint: "#2f9e8f",
        amber: "#d97706",
        coral: "#dc5b57"
      }
    }
  },
  plugins: []
};

export default config;
