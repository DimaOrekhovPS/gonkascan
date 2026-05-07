/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
        display: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Layered dark surfaces — twilight-indigo palette (slightly cooler / bluer)
        night: {
          0: '#080b12',   // page bg deepest
          50: '#0c1019',  // page bg
          100: '#101522',  // surface 0
          200: '#141a26', // surface 1 (cards)
          300: '#1a2130', // surface 2 (raised)
          400: '#21293a', // surface 3 (elevated)
          500: '#293247', // surface 4 (popover)
          600: '#323d54', // border strong
          700: '#3e4a64', // border emphasis
          800: '#4a5775', // muted divider
          900: '#5a6884', // disabled
        },
        // Warm-cool slate text scale for readability on dark
        slate: {
          50: '#f7f8fa',
          100: '#e7e9ee',
          200: '#c5cad4',
          300: '#9ba3b1',
          400: '#737c8c',
          500: '#5a6273',
          600: '#444b5a',
          700: '#333947',
          800: '#222632',
          900: '#13161d',
        },
        // Refined emerald — restrained, elegant accent
        accent: {
          50: '#ebfff7',
          100: '#cffde7',
          200: '#a4f9d3',
          300: '#6cf0bd',
          400: '#3ee5b1',
          500: '#1bcf99',
          600: '#0fb083',
          700: '#0c8a6a',
          800: '#0d6d56',
          900: '#0c5946',
          950: '#053428',
        },
        // Champagne / warm gold for premium hover/highlight accents
        gold: {
          400: '#e9c79a',
          500: '#d4af7a',
          600: '#b89263',
        },
      },
      boxShadow: {
        'card': '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.45)',
        'card-hover':
          '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 8px 24px -10px rgba(0,0,0,0.7), 0 4px 12px -2px rgba(0,0,0,0.5)',
        'pop':
          '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -16px rgba(0,0,0,0.7), 0 8px 24px -4px rgba(0,0,0,0.5)',
        'glow-accent': '0 0 0 1px rgba(62,229,177,0.35), 0 8px 32px -4px rgba(62,229,177,0.18)',
        'glow-accent-soft': '0 0 24px -4px rgba(62,229,177,0.22)',
        'inset-hairline': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      },
      borderRadius: {
        '2.5xl': '1.25rem',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'live-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(62,229,177,0.45)' },
          '70%': { boxShadow: '0 0 0 8px rgba(62,229,177,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(62,229,177,0)' },
        },
        'aurora': {
          '0%, 100%': { transform: 'translate3d(-15%, -10%, 0) scale(1)' },
          '50%': { transform: 'translate3d(15%, 10%, 0) scale(1.1)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 360ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer': 'shimmer 2.4s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'live-pulse': 'live-pulse 1.8s ease-out infinite',
        'aurora': 'aurora 18s ease-in-out infinite',
        'gradient-pan': 'gradient-pan 8s ease infinite',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
      backgroundImage: {
        'grid-faint':
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
}
