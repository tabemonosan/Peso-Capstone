import { MANUAL_CHECKLIST } from '../../shared/manualDocumentReview.js'
export default function ManualDocumentChecklist({ value, onChange }) {
  return <fieldset className="my-3 space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900"><legend>Manual document review</legend>{Object.entries(MANUAL_CHECKLIST).map(([key, label]) => <label key={key} className="block"><input type="checkbox" checked={Boolean(value[key])} onChange={e => onChange({ ...value, [key]: e.target.checked })} /> {label}</label>)}</fieldset>
}
