// ============================================
// PataCerta — YouTubeEmbed
// ============================================
//
// Iframe responsivo (16:9) para um video do YouTube.
// O backend ja normaliza o input (URL/ID) para o ID puro 11-char,
// portanto este componente assume que recebe um ID valido.
//
// Privacy-enhanced mode (youtube-nocookie.com) para reduzir tracking
// antes do utilizador clicar play. Lazy-loaded.

interface YouTubeEmbedProps {
  videoId: string
  title?: string
  className?: string
}

export function YouTubeEmbed({
  videoId,
  title = 'Vídeo de apresentação',
  className,
}: YouTubeEmbedProps) {
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-lg bg-black ${className ?? ''}`}
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  )
}
