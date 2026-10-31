import PortalNavIcon from './PortalNavIcon'
import { useState } from 'react'
import CsmQuestionnaireForm from './CsmQuestionnaireForm'

const questionnaires = [
  { language: 'English', code: 'EN', value: 'en', filename: 'CSM-Questionnaire-English-Online-v2.pdf', description: 'Client Satisfaction Measurement questionnaire in English.' },
  { language: 'Tagalog', code: 'TL', value: 'tl', filename: 'CSM-Questionnaire-TAGALOG-Online-v2.pdf', description: 'Client Satisfaction Measurement questionnaire in Tagalog.' },
]

export default function ReviewQuestionnaires({ token, onSubmitted }) {
  const [language, setLanguage] = useState(null)
  return (
    <section className="portal-card review-questionnaires rounded-2xl border border-slate-300 bg-white p-6 text-slate-900">
      <p className="portal-page-eyebrow">Your feedback matters</p>
      <h2 className="mt-2 text-xl font-semibold">Reviews</h2>
      <p className="mt-2 text-sm text-slate-600">Help us serve you better with the Client Satisfaction Measurement (CSM) questionnaire. Fill it out online in your preferred language, or open and download the original PDF.</p>
      {language ? <CsmQuestionnaireForm key={language} language={language} token={token} onCancel={() => setLanguage(null)} onSubmitted={onSubmitted} /> : <>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {questionnaires.map(({ language, code, value, filename, description }) => {
          const url = `${import.meta.env.BASE_URL}${filename}`
          return (
            <article key={language} className="review-questionnaire-card rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="review-questionnaire-icon"><PortalNavIcon name="requests" /></span>
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">{code} · PDF</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{language}</h3>
              <p className="mt-2 text-sm text-slate-600">{description}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setLanguage(value)} className="rounded-full bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white">Fill online — {language}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800">Open {language} PDF<span className="sr-only"> (opens in a new tab)</span></a>
                <a href={url} download={filename} className="rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800">Download {language} PDF</a>
              </div>
            </article>
          )
        })}
      </div>
      </>}
    </section>
  )
}
