import { PASSWORD_RULES } from "../utils/passwordPolicy"

// Live checklist under the password field; ticks each rule as the user types.
// Also shows a "passwords match" indicator once a confirmation value is entered.
export default function PasswordChecklist({ password, confirmPassword, dark = false }) {
  const text = dark ? "text-slate-300" : "text-[#5c7490]"
  const ok = "text-[#07833f]"
  const bad = dark ? "text-slate-500" : "text-slate-400"

  return (
    <div className="mt-2 space-y-1" aria-live="polite">
      <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const passed = password.length > 0 && rule.test(password)
          return (
            <li key={rule.key} className={`flex items-center gap-1.5 text-xs ${passed ? ok : bad}`}>
              <span aria-hidden="true">{passed ? "✓" : "○"}</span>
              {rule.label}
            </li>
          )
        })}
      </ul>
      {typeof confirmPassword === "string" && confirmPassword.length > 0 && (
        <p className={`text-xs font-medium ${confirmPassword === password ? ok : "text-rose-500"}`}>
          {confirmPassword === password ? "✓ Passwords match" : "✗ Passwords do not match"}
        </p>
      )}
      {password.length === 0 && <p className={`text-xs ${text}`}>8–64 characters, with uppercase, lowercase, a number, and a symbol.</p>}
    </div>
  )
}
