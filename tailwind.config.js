/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0d0b12',
          900: '#16121d',
        },
        smoke: {
          700: '#3a3244',
        },
        hotpink: {
          500: '#ff2f92',
        },
        acid: {
          400: '#c8ff3d',
        },
        laser: {
          500: '#00e6d8',
        },
        flame: {
          500: '#ff5a1f',
        },
        paper: {
          100: '#f3ecf7',
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
        'glow-hotpink': '0 0 32px -4px rgba(255, 47, 146, 0.45)',
        'glow-acid': '0 0 24px -2px rgba(200, 255, 61, 0.45)',
        'glow-laser': '0 0 24px -2px rgba(0, 230, 216, 0.4)',
        'glow-flame': '0 0 24px -2px rgba(255, 90, 31, 0.4)',
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
      },
      animation: {
        flicker: 'flicker 0.6s ease-out 1',
        grain: 'grain 8s steps(4) infinite',
      },
    },
  },
  plugins: [],
};
