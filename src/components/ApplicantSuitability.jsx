const LABELS = { skills: 'Required skills', workExperience: 'Work experience', technicalTraining: 'Technical training', eligibility: 'Eligibility', languages: 'Language / dialect proficiency', availability: 'Immediate availability' }

export default function ApplicantSuitability({ suitability, compact = false }) {
  if (!suitability) return null
  const q = suitability.qualifications
  const dateRange = (row) => [row.fromDate, row.toDate].filter(Boolean).join(' – ')
  return <section aria-label="Applicant job suitability" className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-slate-900">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">#{suitability.rank} · Fit score {suitability.score}/100</span>
      {suitability.rank === 1 && suitability.score > 0 && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Top match</span>}
      {q?.immediatelyAvailable && <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">Available immediately</span>}
    </div>
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold text-cyan-800">{compact ? 'View match details' : 'View qualifications and ranking reasons'}</summary>
      <p className="my-2 text-xs text-slate-600">Compared with this job only. Based on recorded qualifications; PESO and the employer make the final decision.</p>
      <ul className="space-y-1 text-xs">{suitability.components.filter((item) => item.key !== 'availability' || q?.immediatelyAvailable).map((item) => <li key={item.key}><strong>{LABELS[item.key]}:</strong> {item.detail}{item.maximum ? ` (${item.points}/${item.maximum} points)` : ''}</li>)}</ul>
      {q && <dl className="mt-3 space-y-3 text-xs">
        <div><dt className="font-semibold">Technical training</dt><dd>{q.technicalTraining.length ? q.technicalTraining.map((row, index) => <p key={index}>{[row.course, row.institution, row.certificate, dateRange(row)].filter(Boolean).join(' · ')}</p>) : 'Not recorded'}</dd></div>
        <div><dt className="font-semibold">Eligibility</dt><dd>{q.eligibility.length ? q.eligibility.map((row, index) => <p key={index}>{[row.eligibility, row.validUntil && `Valid until ${row.validUntil}`].filter(Boolean).join(' · ')}</p>) : 'Not recorded'}</dd></div>
        <div><dt className="font-semibold">Language / dialect proficiency</dt><dd>{q.languages.length ? q.languages.map((row, index) => <p key={index}>{row.name}: {['read', 'write', 'speak', 'understand'].filter((key) => row[key]).join(', ')}</p>) : 'Not recorded'}</dd></div>
        <div><dt className="font-semibold">Work experience</dt><dd>{q.workExperience.length ? q.workExperience.map((row, index) => <p key={index}>{[row.position, row.company, dateRange(row)].filter(Boolean).join(' · ')}</p>) : 'Not recorded'}</dd></div>
      </dl>}
    </details>
  </section>
}
