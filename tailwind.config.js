/** @type {import('tailwindcss').Config} */

// Litera "Raise the Bar" dark neon theme.
//
// The app was written against Tailwind's light palette and uses it semantically
// and consistently: `bg-white` means "a card", `border-gray-200` means "a
// hairline", `text-gray-900` means "primary text". Rather than rewrite ~290
// utility usages across fifteen files, the palette entries themselves are
// remapped to the dark tokens, so every component inherits the theme and the
// values stay in one place. That is the "tokenize first" rule from
// reference/design/design/retheme-instructions.md.
//
// The gray scale inverts: in a light theme low numbers are pale backgrounds and
// high numbers are dark text; here low numbers are dark surfaces and high
// numbers are near-white text. The mapping follows design-system.md section 6
// verbatim. Nothing in the app used a dark background utility (bg-gray-900 and
// friends appear zero times), so the inversion is safe.

const surface = '#10171B';
const surfaceSubtle = '#151E23';
const border = '#1E2A30';
const borderStrong = '#2C3B43';
const text = '#F2F6F8';
const textSecondary = '#93A5AF';
const textMuted = '#61737D';
const accent = '#23C3BF';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // `white` is deliberately NOT remapped. It stays literal so `text-white`
        // keeps meaning white on coloured fills such as notification badges.
        // `bg-white` meant "a card" in the light theme and is replaced with
        // `bg-surface` in the components instead, which says what it means.

        gray: {
          50: surfaceSubtle,
          100: surfaceSubtle,
          200: border,
          300: borderStrong,
          400: textMuted,
          500: textSecondary,
          600: textSecondary,
          700: text,
          800: text,
          900: text,
        },

        // Status families, kept on-brand rather than Tailwind's defaults. Each
        // maps to the one status colour the design system defines, with soft
        // fills at 13% to match accentSoft.
        emerald: {
          50: 'rgba(61, 214, 140, 0.13)',
          100: 'rgba(61, 214, 140, 0.2)',
          200: 'rgba(61, 214, 140, 0.45)',
          300: 'rgba(61, 214, 140, 0.45)',
          600: '#3DD68C',
          700: '#3DD68C',
          800: '#3DD68C',
        },
        red: {
          50: 'rgba(255, 107, 107, 0.12)',
          100: 'rgba(255, 107, 107, 0.2)',
          200: 'rgba(255, 107, 107, 0.4)',
          300: 'rgba(255, 107, 107, 0.4)',
          500: '#FF6B6B',
          600: '#FF6B6B',
          700: '#FF6B6B',
          800: '#FF6B6B',
        },
        amber: {
          50: 'rgba(254, 222, 21, 0.12)',
          100: 'rgba(254, 222, 21, 0.18)',
          200: 'rgba(254, 222, 21, 0.4)',
          600: '#FEDE15',
          700: '#FEDE15',
          800: '#FEDE15',
        },
        orange: {
          50: 'rgba(246, 81, 0, 0.12)',
          100: 'rgba(246, 81, 0, 0.18)',
          200: 'rgba(246, 81, 0, 0.4)',
          600: '#F65100',
          700: '#F65100',
        },
        blue: {
          50: 'rgba(37, 99, 235, 0.14)',
          100: 'rgba(37, 99, 235, 0.2)',
          200: 'rgba(37, 99, 235, 0.4)',
          600: '#2563EB',
          700: '#5B8DEF',
          800: '#5B8DEF',
        },

        // Named tokens, for new markup that should not lean on the remapped
        // scale above.
        page: '#011122',
        cover: '#0C1E2E',
        surface: {
          DEFAULT: surface,
          subtle: surfaceSubtle,
          sunken: '#0A1013',
        },
        ink: {
          DEFAULT: text,
          secondary: textSecondary,
          muted: textMuted,
          on: '#052322', // text ON a teal fill
        },
        hairline: {
          DEFAULT: border,
          strong: borderStrong,
        },
        // Primary action colour, matching Litera's shipped products where the
        // main button on a screen is the warm brand orange rather than teal.
        action: {
          DEFAULT: '#F65100',
          hover: '#D94800',
          ink: '#FFFFFF',
        },
        accent: {
          DEFAULT: accent,
          soft: 'rgba(35, 195, 191, 0.13)',
          border: 'rgba(35, 195, 191, 0.45)',
          hover: '#1EA9A6',
        },
        neon: {
          teal: '#23C3BF',
          yellow: '#FEDE15',
          orange: '#F65100',
        },

        // The former brand palette now points at the neon accents so any
        // remaining usage lands on-theme instead of the old SaaS blue.
        brand: {
          navy: '#011122',
          blue: accent,
          bluedark: '#1EA9A6',
        },
        canvas: '#011122',
      },

      borderRadius: {
        window: '24px',
      },

      boxShadow: {
        window:
          '0 40px 90px rgba(0,0,0,0.7), 0 0 44px rgba(35,195,191,0.10), 0 0 70px rgba(246,81,0,0.10)',
        popover: '0 20px 44px rgba(0,0,0,0.62), 0 0 0 1px rgba(255,255,255,0.07)',
        modal:
          '0 0 35px rgba(35,195,191,0.35), 0 0 55px rgba(254,222,21,0.25), 0 0 75px rgba(246,81,0,0.3), 0 35px 80px rgba(0,0,0,0.85)',
        glow: '0 0 16px rgba(35,195,191,0.35)',
      },

      backgroundImage: {
        rim: 'linear-gradient(150deg, #23C3BF 0%, #FEDE15 48%, #F65100 100%)',
        cta: 'linear-gradient(90deg, #A83200 0%, #D95300 30%, #FEDE15 60%, #A83200 100%)',
      },
    },
  },
  plugins: [],
};
