/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Teléfono en horizontal: poca altura. Las pantallas de cámara pasan a dos columnas (ver CameraCapture).
      screens: {
        short: { raw: '(orientation: landscape) and (max-height: 500px)' },
      },
      // Los colores son variables CSS (canales "r g b") para que cada evento tenga su piel: ver src/lib/theme.ts.
      // Los valores por defecto (el neón de siempre) están en :root, en src/styles/globals.css.
      // `<alpha-value>` mantiene funcionando `bg-acid-400/50`, `text-paper-100/70`, etc.
      colors: {
        ink: {
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
        },
        smoke: {
          700: 'rgb(var(--c-smoke-700) / <alpha-value>)',
        },
        hotpink: {
          500: 'rgb(var(--c-hotpink-500) / <alpha-value>)',
        },
        acid: {
          400: 'rgb(var(--c-acid-400) / <alpha-value>)',
        },
        laser: {
          500: 'rgb(var(--c-laser-500) / <alpha-value>)',
        },
        flame: {
          500: 'rgb(var(--c-flame-500) / <alpha-value>)',
        },
        paper: {
          100: 'rgb(var(--c-paper-100) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Anton', 'Impact', 'sans-serif'],
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        none: '0px',
      },
      boxShadow: {
        'glow-hotpink': '0 0 32px -4px rgb(var(--c-hotpink-500) / 0.45)',
        'glow-acid': '0 0 24px -2px rgb(var(--c-acid-400) / 0.45)',
        'glow-laser': '0 0 24px -2px rgb(var(--c-laser-500) / 0.4)',
        'glow-flame': '0 0 24px -2px rgb(var(--c-flame-500) / 0.4)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '8%': { opacity: '0.3' },
          '16%': { opacity: '1' },
          '24%': { opacity: '0.4' },
          '32%': { opacity: '1' },
        },
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '50%': { transform: 'translate(-2%, 2%)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        // Entrada corta de un campo que aparece. Si la animación no corre, el campo ya es visible.
        reveal: {
          from: { opacity: '0', transform: 'translateY(4px)' },
        },
      },
      animation: {
        flicker: 'flicker 0.6s ease-out 1',
        grain: 'grain 8s steps(4) infinite',
        ticker: 'ticker 18s linear infinite',
        reveal: 'reveal 200ms cubic-bezier(0.23, 1, 0.32, 1)',
      },
    },
  },
  plugins: [],
};
