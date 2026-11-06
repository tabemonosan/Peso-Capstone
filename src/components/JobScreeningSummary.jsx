export default function JobScreeningSummary({ moderation }) {
  if (!moderation?.decision) return null
  return <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-slate-900"><p className="font-semibold">{moderation.decision === 'auto_approved' ? 'Passed automatic safety screening' : 'PESO review required'}</p>
    {moderation.findings?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{moderation.findings.map((finding, index) => <li key={`${finding.code}-${index}`}>{finding.message}</li>)}</ul>}
  </div>
}
