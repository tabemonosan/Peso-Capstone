// Client-side sorting for lists that are not server-paginated.
// Mirrors the server rules: case-insensitive text, nulls last, stable.
export function sortItems(items, accessor, order = 'asc') {
  const dir = order === 'asc' ? 1 : -1
  const get = typeof accessor === 'function' ? accessor : (item) => item?.[accessor]
  return [...(Array.isArray(items) ? items : [])]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const valueA = get(a.item)
      const valueB = get(b.item)
      const emptyA = valueA === null || valueA === undefined || valueA === ''
      const emptyB = valueB === null || valueB === undefined || valueB === ''
      if (emptyA || emptyB) {
        if (emptyA && emptyB) return a.index - b.index
        return emptyA ? 1 : -1 // nulls last regardless of direction
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return valueA.localeCompare(valueB, 'en', { sensitivity: 'base' }) * dir || a.index - b.index
      }
      const numA = new Date(valueA).getTime?.() ?? valueA
      const numB = new Date(valueB).getTime?.() ?? valueB
      const safeA = Number.isNaN(numA) ? valueA : numA
      const safeB = Number.isNaN(numB) ? valueB : numB
      return (safeA < safeB ? -1 : safeA > safeB ? 1 : a.index - b.index) * dir
    })
    .map(({ item }) => item)
}
