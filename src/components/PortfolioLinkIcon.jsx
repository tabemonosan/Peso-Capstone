const platforms = [
  { name: 'GitHub', icon: 'github', domains: ['github.com', 'github.io'] },
  { name: 'Instagram', icon: 'instagram', domains: ['instagram.com'] },
  { name: 'Facebook', icon: 'facebook', domains: ['facebook.com', 'fb.com', 'fb.me'] },
  { name: 'LinkedIn', icon: 'linkedin', domains: ['linkedin.com'] },
  { name: 'YouTube', icon: 'youtube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] },
  { name: 'TikTok', icon: 'tiktok', domains: ['tiktok.com'] },
]

export function portfolioPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return platforms.find(platform => platform.domains.some(domain => host === domain || host.endsWith(`.${domain}`))) || { name: 'Website', icon: 'web' }
  } catch { return { name: 'Website', icon: 'web' } }
}

export default function PortfolioLinkIcon({ url }) {
  const platform = portfolioPlatform(url)
  const artwork = {
    github: <><path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.9a3.4 3.4 0 0 0-1-2.7c3.3-.4 6.8-1.6 6.8-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.1-4s-1.3-.4-4.2 1.5a14.4 14.4 0 0 0-7.6 0C4.5-.3 3.2.1 3.2.1a5.3 5.3 0 0 0-.1 4 5.7 5.7 0 0 0-1.5 4c0 5.7 3.5 6.9 6.8 7.3a3.4 3.4 0 0 0-1 2.7V22" transform="translate(2 1) scale(.85)" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
    facebook: <path d="M14 22v-9h3l.5-4H14V6.5c0-1 .3-1.5 1.6-1.5H18V1.4A27 27 0 0 0 14.5 1C11 1 9 3 9 6v3H6v4h3v9Z" fill="currentColor" stroke="none" />,
    linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7.5 10v7M11 17v-7m0 3c0-4 6-4 6 0v4" /><circle cx="7.5" cy="6.8" r="1" fill="currentColor" stroke="none" /></>,
    youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 6 3-6 3Z" fill="currentColor" stroke="none" /></>,
    tiktok: <path d="M14 2h3c.3 2.4 1.7 4 4 4.3v3a9 9 0 0 1-4-1.3v7.5a6.5 6.5 0 1 1-5.5-6.4v3.1a3.4 3.4 0 1 0 2.5 3.3Z" fill="currentColor" stroke="none" />,
    web: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" /></>,
  }
  return <span className="portfolio-link-icon" title={platform.name} aria-hidden="true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">{artwork[platform.icon]}</svg>
  </span>
}
