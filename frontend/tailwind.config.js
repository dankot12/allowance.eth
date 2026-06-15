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
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        // Surface dark scale — deep green-tinted charcoal
        surface: {
          0:    '#070d0b',   // page background
          50:   '#0c1612',   // card bg
          100:  '#102018',   // card hover
          200:  '#162c22',   // input bg
          300:  '#1d3d30',   // border subtle
          400:  '#265445',   // border active
          500:  '#2e6b57',   // muted
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
        'hero-glow':         'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16,185,129,0.2), transparent)',
        'card-shine':        'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
      },
      boxShadow: {
        'glow-sm':  '0 0 10px rgba(16,185,129,0.3)',
        'glow-md':  '0 0 20px rgba(16,185,129,0.4)',
        'glow-lg':  '0 0 40px rgba(16,185,129,0.5)',
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
          '0%, 100%': { boxShadow: '0 0 10px rgba(16,185,129,0.3)' },
          '50%':      { boxShadow: '0 0 25px rgba(16,185,129,0.6)' },
        },
      },
    },
  },
  plugins: [],
};
