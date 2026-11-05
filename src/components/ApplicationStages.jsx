const stages = ['Invitation received', 'Invitation accepted', 'Post-interview task', 'Hiring outcome']

export default function ApplicationStages({ application, audience = 'applicant' }) {
  const { status, interview } = application
  if (!interview) return null
  const employer = audience === 'employer'
  const noShow = status?.startsWith('no_show_') || interview?.status === 'missed'
  const steps = (employer ? ['Invitation sent', ...stages.slice(1)] : stages).map((label, index) => index === 2 && noShow ? 'Interview result review' : label)
  const hired = ['hired', 'deployed'].includes(status)
  const declined = ['declined', 'declined_by_admin', 'interview_declined'].includes(status) || interview.status === 'declined'
  const finished = hired || status === 'not_hired' || declined
  const outcome = ['hired', 'deployed', 'not_hired'].includes(status)
  const held = ['held', 'attended'].includes(interview?.status) || ['interview_held', 'interview_attended'].includes(status)
  const confirmed = ['confirmed', 'missed'].includes(interview?.status) || status === 'interview_confirmed'
  const current = finished ? 4 : held || noShow ? 3 : confirmed ? 2 : 1
  const paused = ['withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin', 'interview_declined', 'interview_cancelled', 'no_show_pending', 'no_show_responded', 'no_show_confirmed', 'no_show_dismissed'].includes(status)
  const recorded = [Boolean(interview), confirmed || held || noShow, held, outcome]
  const message = declined ? 'This application is complete. The invitation or application was declined.' : noShow && !outcome ? ['no_show_pending', 'no_show_responded'].includes(status) ? 'A no-show was reported. New reports apply the reputation policy automatically. The applicant can respond or request a penalty review.' : 'PESO reviewed the no-show report. Check the application status and timeline for the result.' : paused ? 'Progress is paused. Check the application status and timeline for the latest update.'
    : outcome ? employer ? `You reported this applicant as ${status.replaceAll('_', ' ')}.` : status === 'not_hired' ? 'The employer reported that you were not selected.' : 'The employer reported that you were accepted for the job.'
      : held ? employer ? 'Interview recorded as held. Provide any post-interview task and report the final hiring outcome.' : 'The interview was recorded as held. Complete any post-interview task the employer provides while awaiting the final outcome.'
        : confirmed ? employer ? 'The applicant accepted the invitation. Hold the interview at the scheduled time.' : 'You accepted the invitation. Attend the interview at the scheduled time.'
          : interview ? employer ? 'Invitation sent. Waiting for the applicant response.' : 'Invitation received. Confirm, request a reschedule, or decline below.'
            : employer ? 'Send an interview invitation to start the process.' : 'Waiting for the employer to send an interview invitation.'
  return <section className="application-stages" aria-label="Application progress">
    <div className="application-stages-heading"><h4 className="font-semibold">Application progress</h4>{finished && <span className={`application-completion ${hired ? 'is-hired' : 'is-closed'}`}>Complete</span>}</div>
    <ol className="application-stage-list" aria-label="Application stages">{steps.map((label, index) => {
      const final = finished && index === 3
      const complete = final || index + 1 < current && recorded[index]
      const active = !finished && index + 1 === current
      return <li key={label} className={`application-stage ${complete ? 'is-complete' : ''} ${final ? hired ? 'is-hired' : 'is-closed' : ''} ${active ? 'is-current' : ''}`} aria-current={active ? 'step' : undefined}>
        <span className="application-stage-number" aria-hidden="true">{complete ? '\u2713' : index + 1}</span><span>{index + 1}. {label}{final && <span className="sr-only"> (Complete)</span>}</span>
      </li>
    })}</ol>
    <p className="mt-3 text-xs text-slate-600" role="status">{message}</p>
  </section>
}
