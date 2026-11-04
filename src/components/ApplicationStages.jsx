const stages = ['Invitation received', 'Invitation accepted', 'Post-interview task', 'Hiring outcome']

export default function ApplicationStages({ application, audience = 'applicant' }) {
  const { status, interview } = application
  const employer = audience === 'employer'
  const noShow = status?.startsWith('no_show_') || interview?.status === 'missed'
  const steps = (employer ? ['Invitation sent', ...stages.slice(1)] : stages).map((label, index) => index === 2 && noShow ? 'Interview result review' : label)
  const outcome = ['hired', 'deployed', 'not_hired'].includes(status)
  const held = ['held', 'attended'].includes(interview?.status) || ['interview_held', 'interview_attended'].includes(status)
  const confirmed = ['confirmed', 'missed'].includes(interview?.status) || status === 'interview_confirmed'
  const current = outcome ? 4 : held || noShow ? 3 : confirmed ? 2 : 1
  const paused = ['withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin', 'interview_declined', 'interview_cancelled', 'no_show_pending', 'no_show_responded', 'no_show_confirmed', 'no_show_dismissed'].includes(status)
  const recorded = [Boolean(interview), confirmed || held || noShow, held, outcome]
  const message = noShow && !outcome ? ['no_show_pending', 'no_show_responded'].includes(status) ? 'A no-show was reported. Step 3 is under PESO review while the applicant has an opportunity to respond.' : 'PESO reviewed the no-show report. Check the application status and timeline for the result.' : paused ? 'Progress is paused. Check the application status and timeline for the latest update.'
    : outcome ? employer ? `You reported this applicant as ${status.replaceAll('_', ' ')}.` : status === 'not_hired' ? 'The employer reported that you were not selected.' : 'The employer reported that you were accepted for the job.'
      : held ? employer ? 'Interview recorded as held. Provide any post-interview task and report the final hiring outcome.' : 'The interview was recorded as held. Complete any post-interview task the employer provides while awaiting the final outcome.'
        : confirmed ? employer ? 'The applicant accepted the invitation. Hold the interview at the scheduled time.' : 'You accepted the invitation. Attend the interview at the scheduled time.'
          : interview ? employer ? 'Invitation sent. Waiting for the applicant response.' : 'Invitation received. Confirm, request a reschedule, or decline below.'
            : employer ? 'Send an interview invitation to start the process.' : 'Waiting for the employer to send an interview invitation.'
  return <section className="application-stages" aria-label="Application progress">
    <h4 className="font-semibold">Application progress</h4>
    <ol className="application-stage-list" aria-label="Application stages">{steps.map((label, index) => <li key={label} className={`application-stage ${index + 1 < current && recorded[index] ? 'is-complete' : index + 1 === current ? 'is-current' : ''}`} aria-current={index + 1 === current ? 'step' : undefined}>
      <span className="application-stage-number" aria-hidden="true">{index + 1 < current && recorded[index] ? '\u2713' : index + 1}</span><span>{index + 1}. {label}</span>
    </li>)}</ol>
    <p className="mt-3 text-xs text-slate-600" role="status">{message}</p>
  </section>
}
