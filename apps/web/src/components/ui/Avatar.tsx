import { useState } from 'react'

interface AvatarProps {
  name: string
  imageUrl?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function getColor(name: string): string {
  // Tons saturados (-500) falham contraste com texto branco (4.5:1).
  // Usamos -700 para garantir AA em todos os hues.
  const colors = [
    'bg-caramel-700',
    'bg-emerald-700',
    'bg-amber-700',
    'bg-rose-700',
    'bg-violet-700',
    'bg-cyan-700',
    'bg-orange-700',
    'bg-teal-700',
  ]
  let hash = 0
  for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Avatar com iniciais + cor derivada do nome.
 *
 * Quando ha `imageUrl`, mostra a foto; se a foto falhar (404, MinIO limpo,
 * URL HTML) cai nas iniciais em vez de deixar o icone de imagem partida do
 * browser. A 40 px um empty state ilustrado nao cabe — as iniciais ja' sao
 * o fallback editorial deste componente.
 */
export function Avatar({ name, imageUrl, size = 'md', className = '' }: AvatarProps) {
  const [errored, setErrored] = useState(false)

  if (imageUrl && !errored) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setErrored(true)}
        className={`${sizes[size]} rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`${sizes[size]} ${getColor(name)} inline-flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      title={name}
      data-testid="avatar-initials"
    >
      {getInitials(name)}
    </div>
  )
}
