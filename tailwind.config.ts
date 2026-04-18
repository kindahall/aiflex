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
        flex: {
          bg: "rgb(var(--flex-bg) / <alpha-value>)",
          panel: "rgb(var(--flex-panel) / <alpha-value>)",
          card: "rgb(var(--flex-card) / <alpha-value>)",
          border: "rgb(var(--flex-border) / <alpha-value>)",
          muted: "rgb(var(--flex-muted) / <alpha-value>)",
          text: "rgb(var(--flex-text) / <alpha-value>)",
          accent: "rgb(var(--flex-accent) / <alpha-value>)",
          accent2: "rgb(var(--flex-accent2) / <alpha-value>)",
          gold: "rgb(var(--flex-gold) / <alpha-value>)",
          surface: "rgb(var(--flex-surface) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-outfit)", "sans-serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)", filter: "brightness(1)" },
          "50%": { opacity: "0.85", transform: "scale(1.05)", filter: "brightness(1.3)" },
        },
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)", borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)", borderRadius: "70% 30% 30% 70% / 70% 70% 30% 30%" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)", borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" },
          "100%": { transform: "translate(0px, 0px) scale(1)", borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        spinGlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        backgroundPan: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 3s infinite linear",
        fadeUp: "fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        pulseGlow: "pulseGlow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        blob: "blob 10s infinite",
        fadeIn: "fadeIn 0.5s ease-out both",
        spinGlow: "spinGlow 4s linear infinite",
        backgroundPan: "backgroundPan 8s ease infinite",
      },
      boxShadow: {
        cinema: "0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset",
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255,255,255,0.05) inset",
        glow: "0 0 20px rgba(var(--flex-accent) / 0.35), 0 0 40px rgba(var(--flex-accent) / 0.15)",
        glowSm: "0 0 10px rgba(var(--flex-accent) / 0.2)",
        obsidian: "0 10px 40px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        hologram: "0 0 15px rgba(var(--flex-accent) / 0.4), inset 0 0 20px rgba(var(--flex-accent) / 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
