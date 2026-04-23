const PT_DATE_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const PT_DATETIME_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const PT_TIME_FORMAT = new Intl.DateTimeFormat('pt-PT', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | Date): string {
  return PT_DATE_FORMAT.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return PT_DATETIME_FORMAT.format(new Date(value))
}

export function formatTime(value: string | Date): string {
  return PT_TIME_FORMAT.format(new Date(value))
}

/** Relative time formatter in pt-PT (e.g. "há 3 minutos"). */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(value).getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'agora mesmo'
  const min = Math.round(sec / 60)
  if (min < 60) return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const hr = Math.round(min / 60)
  if (hr < 24) return `há ${hr} ${hr === 1 ? 'hora' : 'horas'}`
  const day = Math.round(hr / 24)
  if (day < 7) return `há ${day} ${day === 1 ? 'dia' : 'dias'}`
  return formatDate(value)
}

/** Returns a short representation: today shows time, earlier this week shows weekday, older shows date. */
export function formatSmart(value: string | Date, now: Date = new Date()): string {
  const d = new Date(value)
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return formatTime(d)
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 7) {
    return new Intl.DateTimeFormat('pt-PT', { weekday: 'short' }).format(d)
  }
  return formatDate(d)
}
