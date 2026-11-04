import { checkNsrp } from '../../shared/nsrpChecks.js'
const groups = { name: [1, 'Please double-check the spelling of your name.'], education: [3, 'Please double-check your education years.'], work: [5, 'Please double-check your work dates and employment status.'], contact: [2, 'Please double-check your contact details.'], identifiers: [2, 'Please double-check the numbers you entered.'], height: [1, 'Please double-check your height.'], salary: [6, 'Please double-check your expected salary.'], address: [2, 'Please double-check your city and province.'], 'personal details': [1, 'Please double-check your personal details.'] }
export default function NsrpDoubleCheckPanel({ answers, onFix }) {
  const reminders = [...new Set(checkNsrp(answers).findings.filter(f => f.severity === 'warning' && groups[f.fieldGroup]).map(f => f.fieldGroup))]
  if (!reminders.length) return null
  return <section className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><h3 className="font-semibold">Please double-check</h3><p>You can still submit. These reminders may help you spot a typo.</p>{reminders.map(group => <p key={group} className="mt-2">{groups[group][1]} <button type="button" className="rounded border border-amber-400 bg-white px-2 py-1 text-amber-900" onClick={() => onFix(groups[group][0])}>Fix</button></p>)}</section>
}
