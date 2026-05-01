const DATE_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }
const DATETIME_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }

const isValidYear = (d: Date) => d.getFullYear() >= 1900 && d.getFullYear() <= 2100

export const fmtDate = (v: string | Date | null | undefined): string => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU', DATE_OPTS)
}

export const fmtDateTime = (v: string | Date | null | undefined): string => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU', DATETIME_OPTS)
}

/** Safe value for <input type="date">. Returns '' for null/invalid/out-of-range dates. */
export const toDateInput = (v: string | null | undefined): string => {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime()) || !isValidYear(d)) return ''
  return d.toISOString().split('T')[0]
}

export const TODAY = new Date().toISOString().split('T')[0]
