import type { Config } from 'tailwindcss'

/* Paletas que seguem o TEMA (globals.css, "Escalas de cor por tema"): nos temas Nxt valem o
   original do Tailwind; nos outros, a escala do tema. `<alpha-value>` mantém o `/40` etc. */
const escalaDoTema = (nome: string) => Object.fromEntries(
  ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'].map((k) => [k, `rgb(var(--${nome}-${k}) / <alpha-value>)`]),
)

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Marca Nxt (valores fixos da identidade — usar direto: bg-forest, text-spark…)
        forest: 'rgb(var(--forest) / <alpha-value>)', // Forest Ink (no Nxt: #0C1410)
        spark: 'rgb(var(--spark) / <alpha-value>)', // Lime Spark (no Nxt: #C6F24E)
        mist: 'rgb(var(--mist) / <alpha-value>)', // Mist (no Nxt: #F2F6F1)
        emerald: escalaDoTema('emerald'),
        green: escalaDoTema('green'),
        teal: escalaDoTema('teal'),
        lime: escalaDoTema('lime'),
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        sidebar: {
          DEFAULT:    'hsl(var(--sidebar-bg))',
          foreground: 'hsl(var(--sidebar-fg))',
          border:     'hsl(var(--sidebar-border))',
          muted:      'hsl(var(--sidebar-muted))',
          active:     'hsl(var(--sidebar-active-bg))',
          'active-fg':'hsl(var(--sidebar-active-fg))',
          hover:      'hsl(var(--sidebar-hover-bg))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
