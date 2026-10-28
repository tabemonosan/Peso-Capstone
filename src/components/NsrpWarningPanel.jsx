import { useState } from "react"
import {
  NSRP_WARNING_MESSAGES, NSRP_WARNING_SEVERITY, NSRP_WARNING_COLLAPSE_THRESHOLD,
  getNsrpFieldLabel, groupNsrpWarnings, summarizeNsrpWarnings,
} from "../../shared/nsrpFieldLabels.js"

/**
 * Grouped, plain-language print-fit warnings for the NSRP Preview step.
 * Informational only — never blocks "Confirm and submit".
 * Compact one-line rows: icon, field name, status chip, Fix button.
 * The explanation text is shown once per group instead of on every row,
 * and is also available as a tooltip on the field name.
 */
export default function NsrpWarningPanel({ warnings, onFix, onFixAllCutOff, cutOffRemaining = 0 }) {
  const [expanded, setExpanded] = useState(false)
  if (!warnings?.length) return null
  const groups = groupNsrpWarnings(warnings)
  const cutOffCount = warnings.filter((warning) => warning.reason === 'truncated').length
  const collapsible = warnings.length > NSRP_WARNING_COLLAPSE_THRESHOLD
  const showDetails = !collapsible || expanded
  return (
    <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
      <p className="text-sm font-semibold">A few entries won't print cleanly</p>
      <p className="mt-0.5 text-amber-800">You can still submit, but shortening these makes your NSRP form easier to read.</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{summarizeNsrpWarnings(warnings)}</p>
        <div className="flex gap-2">
          {cutOffCount > 0 && (
            <button
              type="button"
              onClick={() => onFixAllCutOff?.()}
              className="rounded-lg border border-rose-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-800"
            >
              {cutOffRemaining > 0 ? `Fix next cut-off entry (${cutOffRemaining} left)` : 'Fix all cut-off entries'}
            </button>
          )}
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={showDetails}
              className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900"
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          )}
        </div>
      </div>
      {showDetails && groups.map((group) => {
        const severities = [...new Set(group.items.map((item) => NSRP_WARNING_SEVERITY[item.reason]?.key || item.reason))]
        return (
          <section key={group.key} className="mt-2">
            <p className="font-bold uppercase tracking-wide text-amber-900">
              {group.title} ({group.count} {group.count === 1 ? 'entry' : 'entries'})
            </p>
            <p className="mt-0.5 text-[11px] text-amber-800">
              {severities.map((key) => NSRP_WARNING_MESSAGES[key]).filter(Boolean).join(' ')}
            </p>
            <ul className="mt-1 space-y-1">
              {group.items.map((warning) => {
                const severity = NSRP_WARNING_SEVERITY[warning.reason] || NSRP_WARNING_SEVERITY['minimum-font-size']
                const isCutOff = severity.key === 'truncated'
                const label = getNsrpFieldLabel(warning.field)
                const detail = NSRP_WARNING_MESSAGES[warning.reason] || NSRP_WARNING_MESSAGES['minimum-font-size']
                const lengthInfo = warning.limit > 0 && typeof warning.length === 'number'
                  ? ` Currently ${warning.length} of ${warning.limit} characters.`
                  : ''
                return (
                  <li
                    key={`${warning.field}-${warning.reason}`}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${isCutOff ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-300 bg-amber-100/60 text-amber-900'}`}
                  >
                    <span aria-hidden="true" className="shrink-0">{isCutOff ? '⛔' : '⚠️'}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold" title={`${detail}${lengthInfo}`}>
                      {label}
                      {lengthInfo && <span className="ml-1 font-normal opacity-75">({warning.length}/{warning.limit})</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${isCutOff ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'}`}>
                      {isCutOff ? 'Cut off' : 'Small'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onFix?.(warning.field)}
                      className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${isCutOff ? 'border-rose-400 text-rose-800' : 'border-amber-400 text-amber-900'} bg-white`}
                    >
                      Fix
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
