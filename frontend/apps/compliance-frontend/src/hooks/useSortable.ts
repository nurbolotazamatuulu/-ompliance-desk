import { useState, useMemo } from 'react'

type Dir = 'asc' | 'desc'

export function useSortable<T>(data: T[], defaultKey: keyof T | '', defaultDir: Dir = 'asc') {
  const [sortKey, setSortKey] = useState<keyof T | ''>(defaultKey)
  const [sortDir, setSortDir] = useState<Dir>(defaultDir)

  const toggle = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = String(av).localeCompare(String(bv), 'ru', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggle }
}
