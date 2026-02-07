import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: "class",
  content: [
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    // App consumers need to add their own content paths
  ],
  theme: {
    screens: {
      xs: "0px",
      sm: "600px",
      md: "960px",
      lg: "1280px",
      xl: "1920px",
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        button: "4px",
        input: "8px",
        dialog: "12px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      fontSize: {
        h1: ["2.5rem", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["2rem", { lineHeight: "1.3", fontWeight: "600" }],
        h3: ["1.75rem", { lineHeight: "1.4", fontWeight: "600" }],
        h4: ["1.5rem", { lineHeight: "1.4", fontWeight: "600" }],
        h5: ["1.25rem", { lineHeight: "1.5", fontWeight: "600" }],
        h6: ["1rem", { lineHeight: "1.5", fontWeight: "600" }],
        body1: ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        body2: ["0.875rem", { lineHeight: "1.43", fontWeight: "400" }],
        button: ["0.875rem", { lineHeight: "1.5", fontWeight: "500" }],
        caption: ["0.75rem", { lineHeight: "1.66", fontWeight: "400" }],
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        xxl: "48px",
      },
      boxShadow: {
        "elevation-0": "none",
        "elevation-1": "0 1px 3px rgba(0,0,0,0.12)",
        "elevation-2": "0 3px 6px rgba(0,0,0,0.16)",
        "elevation-3": "0 10px 20px rgba(0,0,0,0.19)",
        "elevation-4": "0 14px 28px rgba(0,0,0,0.25)",
      },
      transitionDuration: {
        shortest: "150ms",
        shorter: "200ms",
        short: "250ms",
        standard: "300ms",
        complex: "375ms",
        entering: "225ms",
        leaving: "195ms",
      },
      transitionTimingFunction: {
        "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        "ease-out": "cubic-bezier(0.0, 0, 0.2, 1)",
        "ease-in": "cubic-bezier(0.4, 0, 1, 1)",
        sharp: "cubic-bezier(0.4, 0, 0.6, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    tailwindAnimate,
    plugin(function ({ addUtilities }) {
      addUtilities({
        ".touch-target": {
          "min-height": "44px",
          "min-width": "44px",
        },
        ".touch-spacing": {
          margin: "8px",
        },
        ".mobile-stack": {
          display: "flex",
          "flex-direction": "column",
        },
        ".mobile-hide": {
          "@screen md": {
            display: "block",
          },
          display: "none",
        },
        ".mobile-show": {
          "@screen md": {
            display: "none",
          },
          display: "block",
        },
      });
    }),
    plugin(function ({ addComponents }) {
      addComponents({
        ".typography-h1": {
          fontSize: "2.5rem",
          lineHeight: "1.2",
          fontWeight: "700",
        },
        ".typography-h2": {
          fontSize: "2rem",
          lineHeight: "1.3",
          fontWeight: "600",
        },
        ".typography-h3": {
          fontSize: "1.75rem",
          lineHeight: "1.4",
          fontWeight: "600",
        },
        ".typography-h4": {
          fontSize: "1.5rem",
          lineHeight: "1.4",
          fontWeight: "600",
        },
        ".typography-h5": {
          fontSize: "1.25rem",
          lineHeight: "1.5",
          fontWeight: "600",
        },
        ".typography-h6": {
          fontSize: "1rem",
          lineHeight: "1.5",
          fontWeight: "600",
        },
        ".typography-body1": {
          fontSize: "1rem",
          lineHeight: "1.5",
          fontWeight: "400",
        },
        ".typography-body2": {
          fontSize: "0.875rem",
          lineHeight: "1.43",
          fontWeight: "400",
        },
        ".typography-button": {
          fontSize: "0.875rem",
          lineHeight: "1.5",
          fontWeight: "500",
          textTransform: "none",
        },
        ".typography-caption": {
          fontSize: "0.75rem",
          lineHeight: "1.66",
          fontWeight: "400",
        },
      });
    }),
  ],
};

export default config;
