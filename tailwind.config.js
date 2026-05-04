/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo:  '#6366F1',
        gold:    '#F59E0B',
        emerald: '#10B981',
        ruby:    '#EF4444',
      },
      fontFamily: {
        display: ['Clash Display', 'sans-serif'],
        body:    ['Satoshi', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}