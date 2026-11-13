import { useEffect, useState } from 'react'

// Keep navigation visible near the top and reveal it when scrolling upward.
export function useScrollNavigation(enabled = true) {
  const [hidden, setHidden] = useState(false)
  const [atTop, setAtTop] = useState(true)
  useEffect(() => {
    setHidden(false)
    setAtTop(!enabled || window.scrollY <= 0)
    if (!enabled) return
    let lastScroll = Math.max(0, window.scrollY)
    const update = () => {
      const current = Math.max(0, window.scrollY)
      setAtTop(current === 0)
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
  return { hidden, atTop }
}

export function useScrollHidden(enabled = true) {
  return useScrollNavigation(enabled).hidden
}
