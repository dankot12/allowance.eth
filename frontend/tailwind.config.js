/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core palette — electric violet/indigo meets dark metal
        brand: {
          50:  '#f0edff',
          100: '#e0daff',
          200: '#c4b5ff',
          300: '#a78bff',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#2e1065',
        },
        // Surface dark scale
        surface: {
          0:    '#08080f',   // page background
          50:   '#0d0d1a',   // card bg
          100:  '#111128',   // card hover
          200:  '#16163a',   // input bg
          300:  '#1e1e50',   // border subtle
          400:  '#2a2a6e',   // border active
          500:  '#3b3b8f',   // muted
        },
        // Status colors
        success: '#10b981',
        warning: '#f59e0b',
        danger:  '#ef4444',
        info:    '#06b6d4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'gradient-radial':   'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':    'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'hero-glow':         'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(124,58,237,0.3), transparent)',
        'card-shine':        'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
      },
      boxShadow: {
        'glow-sm':  '0 0 10px rgba(124,58,237,0.3)',
        'glow-md':  '0 0 20px rgba(124,58,237,0.4)',
        'glow-lg':  '0 0 40px rgba(124,58,237,0.5)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'float':        'float 6s ease-in-out infinite',
        'glow-pulse':   'glowPulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(124,58,237,0.3)' },
          '50%':      { boxShadow: '0 0 25px rgba(124,58,237,0.6)' },
        },
      },
    },
  },
  plugins: [],
};
