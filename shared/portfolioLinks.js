export const MAX_PORTFOLIO_LINKS = 5

export function validatePortfolioLinks(input) {
  if (!Array.isArray(input) || input.length > MAX_PORTFOLIO_LINKS) return { error: 'Add up to 5 portfolio links.' }
  const links = []
  for (const item of input) {
    if (!item || typeof item.label !== 'string' || typeof item.url !== 'string') return { error: 'Each link needs a title and website URL.' }
    const label = item.label.trim(), value = item.url.trim()
    if (!label || label.length > 80 || !value || value.length > 2048) return { error: 'Enter a title (up to 80 characters) and a website URL for each link.' }
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error()
      links.push({ label, url: url.href })
    } catch { return { error: 'Use a full website URL starting with https:// or http://.' } }
  }
  return { links }
}
