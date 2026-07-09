/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Crayon-style brand palette (see reference/ screenshot).
        brand: {
          navy: '#0A2540',
          blue: '#2563EB',
          bluedark: '#1D4ED8',
        },
        canvas: '#F4F6F9',
      },
    },
  },
  plugins: [],
};
