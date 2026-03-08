/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'imessage-blue': '#007AFF',
        'imessage-green': '#34C759',
        'bubble-gray': '#E9E9EB',
        'bubble-gray-dark': '#3A3A3C',
      },
    },
  },
  plugins: [],
};
