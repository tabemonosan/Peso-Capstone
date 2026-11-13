import { useId, useState } from 'react'
import './PasswordInput.css'

export default function PasswordInput({ id, visibilityLabel = 'password', visible: controlledVisible, onVisibilityChange, ...props }) {
  const generatedId = useId()
  const inputId = id || generatedId
  const [localVisible, setLocalVisible] = useState(false)
  const visible = controlledVisible ?? localVisible
  const toggleVisibility = () => {
    const next = !visible
    if (controlledVisible === undefined) setLocalVisible(next)
    onVisibilityChange?.(next)
  }
  const label = `${visible ? 'Hide' : 'Show'} ${visibilityLabel}`

  return <span className="password-field">
    <input {...props} id={inputId} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-visibility-toggle" aria-label={label} title={label} aria-controls={inputId} aria-pressed={visible} disabled={props.disabled} onClick={toggleVisibility}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  </span>
}
