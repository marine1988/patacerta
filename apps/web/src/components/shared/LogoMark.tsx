// PataCerta — LogoMark
// ===========================================================================
// Versao em React do icone usado tambem como favicon (apps/web/public/paw.svg).
// O ficheiro estatico tem cor unica caramel; aqui temos duas vantagens:
//
//   1. Usar tokens de tema (fill-caramel-500 + fill-bg) para que o "P"
//      recortado leia sempre com a cor correcta de fundo da pagina, tanto
//      em light como em dark mode. No favicon nao podemos fazer isto porque
//      o fundo da tab e' controlado pelo browser/OS, mas no header sim.
//
//   2. Aceitar tamanho via prop sem ter de duplicar o SVG.
//
// O desenho e' identico ao paw.svg: 4 toe-pads + almofada principal com um
// "P" serifa em vez de fill-rule:evenodd usamos um <rect> a "tapar" o P
// com a cor do bg, o que evita problemas de subpixel rendering em retina
// e mantem o icone nitido a tamanhos pequenos (16-32px).

import { type SVGProps } from 'react'

export interface LogoMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Pixel size for both width & height. Defaults to 24. */
  size?: number
}

export function LogoMark({ size = 24, className, ...rest }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="PataCerta"
      className={className}
      {...rest}
    >
      {/* Toe pads + main pad em caramel */}
      <g className="fill-caramel-500">
        <ellipse cx="6.5" cy="9" rx="2.6" ry="3.4" transform="rotate(-22 6.5 9)" />
        <ellipse cx="12" cy="5.5" rx="2.4" ry="3.3" />
        <ellipse cx="20" cy="5.5" rx="2.4" ry="3.3" />
        <ellipse cx="25.5" cy="9" rx="2.6" ry="3.4" transform="rotate(22 25.5 9)" />
        <path d="M 16 12 C 22.5 12 27 16.5 27 21.5 C 27 26.5 22.5 29.5 16 29.5 C 9.5 29.5 5 26.5 5 21.5 C 5 16.5 9.5 12 16 12 Z" />
      </g>

      {/*
        "P" recortado por cima da almofada, na cor do fundo do tema. Usar
        fill-bg garante que em light mode aparece cream e em dark charcoal.
        Desenhamos a haste e o bowl como dois shapes (haste + ring) para
        ficarem consistentemente nitidos a 16-24px.
      */}
      <g className="fill-bg">
        {/* Haste vertical do P */}
        <rect x="12.6" y="16.3" width="2.3" height="10.0" />
        {/* Bowl (anel) — outer + inner como evenodd */}
        <path
          fillRule="evenodd"
          d="M 14.9 16.3 L 16.9 16.3 C 19.1 16.3 20.6 17.6 20.6 19.5 C 20.6 21.4 19.1 22.7 16.9 22.7 L 14.9 22.7 Z M 14.9 18.0 L 16.6 18.0 C 17.9 18.0 18.6 18.6 18.6 19.5 C 18.6 20.4 17.9 21.0 16.6 21.0 L 14.9 21.0 Z"
        />
      </g>
    </svg>
  )
}
