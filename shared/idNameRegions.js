// Locate PhilSys name values using recognized labels and word positions.
// Keep portraits and distant security-pattern noise outside the OCR crops.
export function philSysNameRegions(lines = []) {
  const key = text => String(text || '').toLowerCase().replace(/[^a-z]/g, '')
  // JPEG conversion can merge and distort this printed label. Fuzzy matching
  // locates labels only; name values still require independent, confident OCR.
  const surnameLabel = text => {
    const value = key(text)
    return value.includes('apelyidolast') || value.length >= 12 && value.length <= 18 && editDistance(value, 'apelyidolastname') <= 4
  }
  const definitions = [
    ['surname', 'Surname', (text, words) => key(text).includes('apelyidolast') || words?.some(word => surnameLabel(word.text))],
    ['firstName', 'First name', text => key(text).includes('mgapangalan')],
    ['middleName', 'Middle name', text => key(text).includes('gitnangapelyido')],
  ]
  const headers = definitions.map(([field, label, matches]) => ({ field, label, index: lines.findIndex(line => matches(line.text, line.words)) }))
  if (headers.some(header => header.index < 0)) return []
  const anchor = lines[headers[0].index].words?.find(word => surnameLabel(word.text))?.bbox?.x0
  if (!Number.isFinite(anchor)) return []
  return headers.flatMap(({ field, label, index }) => {
    const end = Math.min(...headers.filter(header => header.index > index).map(header => header.index), index + 4)
    for (const line of lines.slice(index + 1, end)) {
      const words = (line.words || []).filter(word => word.bbox && /[a-z]/i.test(word.text)).sort((a, b) => a.bbox.x0 - b.bbox.x0)
      const start = words.findIndex(word => word.bbox.x0 >= anchor - 20 && word.bbox.x0 <= anchor + 100)
      if (start < 0) continue
      const selected = [words[start]]
      for (const word of words.slice(start + 1)) {
        const previous = selected.at(-1).bbox, box = word.bbox
        const height = previous.y1 - previous.y0
        if (box.x0 - previous.x1 > Math.max(32, height * 0.85) || Math.abs((box.y0 + box.y1 - previous.y0 - previous.y1) / 2) > height / 2) break
        selected.push(word)
      }
      return [{ field, label, bbox: {
        x0: Math.min(...selected.map(word => word.bbox.x0)), y0: Math.min(...selected.map(word => word.bbox.y0)),
        x1: Math.max(...selected.map(word => word.bbox.x1)), y1: Math.max(...selected.map(word => word.bbox.y1)),
      } }]
    }
    return []
  })
}
import { editDistance } from './crossChecks.js'

