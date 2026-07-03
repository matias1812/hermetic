/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#050308',
        darkSurface: '#0b0813',
        darkMuted: '#1b1727',
        terminalGreen: '#00ffb7',
        darkGrey: '#222222',
        lightGrey: '#444444',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
