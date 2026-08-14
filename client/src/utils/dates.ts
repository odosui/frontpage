// parses a date string and formats as YYYY-MM-DD HH:mm:ss
export function formatIso(dstr: string): string {
  const d = new Date(dstr)
  return `${d.getFullYear()}-${
    d.getMonth() + 1
  }-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
}

/** Compact relative time for feed items: "now", "12m", "3h", "2d". */
export function timeAgo(dateString: string): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(dateString).getTime()) / 1000),
  )
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function diffInDays(dateString: string) {
  const now = new Date() // Current date and time
  const inputDate = new Date(dateString) // Date created from input string

  // Calculate the difference in time (in milliseconds)
  const diffTime = now.getTime() - inputDate.getTime()

  // Convert the difference to days
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

export function daysAgo(str: string) {
  const d = diffInDays(str)
  if (d === 0) {
    return 'today'
  }
  return `${d} days ago`
}

export function daysTill(days: number) {
  if (days <= 0) {
    return 'review now'
  }
  if (days === 1) {
    return 'tomorrow'
  }
  return 'in ' + days + ' ' + (days % 10 === 1 ? 'day' : 'days')
}
