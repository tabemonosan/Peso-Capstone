import { correctionGuidance } from '../../shared/correctionGuidance.js'
export default function CorrectionGuidance(props) {
  const guidance = correctionGuidance(props)
  return <section aria-label="Correction instructions" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <h4 className="font-semibold">{guidance.title}</h4>
    <ol className="mt-2 list-decimal space-y-2 pl-5">{guidance.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="mt-3 text-xs leading-relaxed">{guidance.after}</p>
  </section>
}
