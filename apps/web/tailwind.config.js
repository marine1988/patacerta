/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ===== Brand accents (iguais em ambos os modos) =====
        caramel: {
          50: '#FAF3EB',
          100: '#F1E0CE',
          200: '#E4C6A6',
          300: '#D4A77E',
          400: '#C69568',
          500: '#B8895F', // primary accent
          600: '#A07548',
          700: '#8F6541', // hover/deep
          800: '#6E4E33',
          900: '#4D3624',
        },
        sage: {
          50: '#EEF1EC',
          100: '#D8DFD3',
          200: '#B5C0AE',
          300: '#8A9684',
          400: '#6B7865',
          500: '#4F5D4A', // secondary accent
          600: '#3F4B3B',
          700: '#32382F',
          800: '#252B23',
          900: '#181D17',
        },

        // ===== Semantic tokens (mudam com dark mode) =====
        // Uso: bg-bg, bg-surface, text-ink, text-muted, border-subtle, etc.
        bg: {
          DEFAULT: '#F7F3EC', // light: bone/cream
          dark: '#141312', // dark: carvão quente
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#1C1B19',
        },
        'surface-alt': {
          DEFAULT: '#EFE9DF',
          dark: '#252320',
        },
        ink: {
          DEFAULT: '#1A1A1A', // texto principal
          dark: '#F2EDE2',
        },
        muted: {
          DEFAULT: '#5C574E',
          dark: '#A8A196',
        },
        subtle: {
          DEFAULT: '#8A837A',
          // dark: subido de #6F6A61 para garantir contraste >=4.5:1 sobre bg.dark (#141312)
          dark: '#9B9388',
        },
        line: {
          DEFAULT: '#E0D7C6',
          dark: '#2F2C28',
        },
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['"Open Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Editorial display scale
        display: ['clamp(3rem, 6vw, 5.5rem)', { lineHeight: '0.98', letterSpacing: '-0.02em' }],
        h1: ['clamp(2.25rem, 4.5vw, 3.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        h2: ['clamp(1.75rem, 3vw, 2.5rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        eyebrow: ['10px', { lineHeight: '1', letterSpacing: '0.25em' }],
      },
      letterSpacing: {
        caps: '0.25em',
        capsWide: '0.3em',
        capsLoose: '0.35em',
      },
      borderRadius: {
        // Editorial prefere cantos rectos / levemente arredondados
        DEFAULT: '2px',
        sm: '1px',
        md: '3px',
        lg: '4px',
      },
      boxShadow: {
        // Sombras subtis e quentes, não azuladas
        subtle: '0 1px 2px 0 rgb(26 26 26 / 0.04)',
        soft: '0 4px 16px -4px rgb(26 26 26 / 0.06)',
        lift: '0 12px 32px -8px rgb(26 26 26 / 0.10)',
      },
    },
  },
  plugins: [],
}
