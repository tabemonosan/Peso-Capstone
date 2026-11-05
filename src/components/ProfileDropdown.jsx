import { useEffect, useId, useRef, useState } from 'react'

export default function ProfileDropdown({ children, className, onProfile, onSettings }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  const menuId = useId()
  useEffect(() => {
    if (!open) return
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  const focusItem = index => root.current?.querySelectorAll('[role="menuitem"]')[index]?.focus()
  const choose = callback => { setOpen(false); trigger.current?.focus(); callback() }
  return <div ref={root} className="portal-profile-dropdown" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); event.stopPropagation() }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const items = [...root.current.querySelectorAll('[role="menuitem"]')]
      const current = items.indexOf(document.activeElement)
      focusItem(event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length)
    }
  }}>
    <button ref={trigger} type="button" aria-label="Profile" className={className} aria-haspopup={onSettings ? 'menu' : undefined} aria-expanded={onSettings ? open : undefined} aria-controls={open ? menuId : undefined} onClick={() => onSettings ? setOpen(value => !value) : onProfile()} onKeyDown={event => {
      if (onSettings && !open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); setOpen(true)
        requestAnimationFrame(() => focusItem(event.key === 'ArrowUp' ? root.current.querySelectorAll('[role="menuitem"]').length - 1 : 0))
      }
    }}>
      {children}
      {onSettings && <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 7 5 5 5-5" /></svg>}
    </button>
    {open && <div id={menuId} role="menu" aria-label="Profile options" className="portal-profile-menu">
      <button type="button" role="menuitem" onClick={() => choose(onProfile)}>View Profile</button>
      <button type="button" role="menuitem" onClick={() => choose(onSettings)}>Account Settings</button>
    </div>}
  </div>
}
