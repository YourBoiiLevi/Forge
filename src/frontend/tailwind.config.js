/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-surface': 'var(--bg-surface)',
        'bg-overlay': 'var(--bg-overlay)',
        'border': 'var(--border)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'accent': 'var(--accent)',
        'success': 'var(--success)',
        'error': 'var(--error)',
        'warning': 'var(--warning)',
      },
      fontFamily: {
        'pixel': ['var(--font-pixel)', 'monospace'],
        'mono': ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        'none': '0',
      },
      animation: {
        'pulse-led': 'pulse-led 2s infinite',
      }
    },
  },
  plugins: [],
}
