/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          950: '#06060c',
          900: '#0a0a14',
          850: '#0e0e1a',
          800: '#121222',
          750: '#17172c',
          700: '#1c1c34',
          600: '#242442',
          500: '#2c2c50',
          400: '#3a3a64',
          300: '#48487a',
        },
        accent: {
          cyan:   '#06b6d4',
          violet: '#8b5cf6',
          amber:  '#f59e0b',
          rose:   '#f43f5e',
          emerald:'#10b981',
        },
      },
      fontFamily: {
        sans: ['"EB Garamond"', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
        garamond: ['"EB Garamond"', 'serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh': 'linear-gradient(135deg, #0a0a14 0%, #10101e 50%, #0a0a14 100%)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':   'slideIn 0.3s ease-out',
        'fade-in':    'fadeIn 0.4s ease-out',
        'glow':       'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        slideIn: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        fadeIn:  { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        glow:    { from: { boxShadow: '0 0 5px #6366f1' }, to: { boxShadow: '0 0 20px #6366f1, 0 0 40px #6366f133' } },
      },
      boxShadow: {
        'glow-sm':  '0 0 10px rgba(99,102,241,0.3)',
        'glow-md':  '0 0 20px rgba(99,102,241,0.4)',
        'glow-lg':  '0 0 40px rgba(99,102,241,0.3)',
        'glass':    '0 8px 32px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}
