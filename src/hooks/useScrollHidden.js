import { useEffect, useState } from 'react'

// Keep navigation visible near the top and reveal it when scrolling upward.
export function useScrollHidden(enabled = true) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    setHidden(false)
    if (!enabled) return
    let lastScroll = Math.max(0, window.scrollY)
    const update = () => {
      const current = Math.max(0, window.scrollY)
      if (current <= 100) {
        setHidden(false)
        lastScroll = current
      } else if (Math.abs(current - lastScroll) >= 8) {
        setHidden(current > lastScroll)
        lastScroll = current
      }
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [enabled])
  return hidden
}
