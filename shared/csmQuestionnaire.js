import { isValidCalendarDate, todayInManila } from './nsrpValidation.js'

export const CSM_VERSION = 'CSM-Online-v2'
export const CSM_RATING_VALUES = ['strongly_agree', 'agree', 'neutral', 'disagree', 'strongly_disagree', 'na']
export const CSM_QUESTION_KEYS = Array.from({ length: 9 }, (_, index) => `SQD${index}`)
export const CSM_TEXT = {
  en: {
    language: 'English', title: 'Help us serve you better!',
    introduction: 'This Client Satisfaction Measurement (CSM) tracks the customer experience of government offices. Your feedback on your recently concluded transaction will help this office provide a better service.',
    voluntary: 'Answering is voluntary. Name, address, email, and suggestions are optional. Online responses are linked to your PESO account and can be reviewed by PESO administrators.',
    respondent: 'About your transaction', clientType: 'Client type', clientTypes: ['Citizen', 'Business', 'Government (employee or another agency)'], date: 'Transaction date', sex: 'Sex', sexes: ['Male', 'Female'], age: 'Age', name: 'Name (optional)', address: 'Address (optional)', email: 'Email address (optional)',
    charter: 'Citizen’s Charter', charterInstructions: 'The Citizen’s Charter is an official document that reflects the services of a government agency/office including its requirements, fees, and processing times.',
    cc1: 'CC1. Which of the following best describes your awareness of a Citizen’s Charter?',
    cc1Options: ['I know what a CC is and I saw this office’s CC.', 'I know what a CC is but I did NOT see this office’s CC.', 'I learned of the CC only when I saw this office’s CC.', 'I do not know what a CC is and I did not see one in this office.'],
    cc2: 'CC2. If aware of the Citizen’s Charter, would you say that the CC of this office was…?',
    cc2Options: ['Easy to see', 'Somewhat easy to see', 'Difficult to see', 'Not visible at all', 'Not applicable'],
    cc3: 'CC3. If aware of the Citizen’s Charter, how much did the CC help you in your transaction?',
    cc3Options: ['Helped very much', 'Somewhat helped', 'Did not help', 'Not applicable'],
    charterSkipped: 'CC2 and CC3 are marked Not applicable because you selected option 4 in CC1.',
    quality: 'Service quality', qualityInstructions: 'For SQD0–SQD8, choose the answer that best corresponds to your experience.',
    ratingLabels: ['Strongly agree', 'Agree', 'Neither agree nor disagree', 'Disagree', 'Strongly disagree', 'N/A — Not applicable'],
    questions: [
      'I am satisfied with the service that I availed.',
      'I spent a reasonable amount of time for my transaction.',
      'The office followed the transaction’s requirements and steps based on the information provided.',
      'The steps (including payment) I needed to do for my transaction were easy and simple.',
      'I easily found information about my transaction from the office’s website.',
      'I paid a reasonable amount of fees for my transaction. (If service was free, mark N/A.)',
      'I am confident my online transaction was secure.',
      'The office’s online support was available, and (if asked questions) online support was quick to respond.',
      'I got what I needed from the government office, or (if denied) denial of request was sufficiently explained to me.',
    ],
    suggestions: 'Suggestions on how we can further improve our services (optional)', submit: 'Submit feedback to PESO', submitting: 'Submitting…', back: 'Back to questionnaires', success: 'Thank you! Your feedback was submitted to PESO.', reference: 'Submission reference', submitted: 'Submitted', another: 'Back to Reviews', required: 'Required unless marked optional.', staff: 'Control numbers and office/service details on the original form are completed by PESO staff.',
  },
  tl: {
    language: 'Tagalog', title: 'Tulungan ninyo kaming mas mapabuti ang aming serbisyo!',
    introduction: 'Ang Client Satisfaction Measurement (CSM) ay naglalayong masubaybayan ang karanasan ng taumbayan hinggil sa kanilang pakikitransaksyon sa mga tanggapan ng gobyerno. Makatutulong ang inyong kasagutan upang mas mapahusay ang aming serbisyo publiko.',
    voluntary: 'Boluntaryo ang pagsagot. Opsyonal ang pangalan, tirahan, email, at suhestiyon. Ang online na sagot ay nakaugnay sa inyong PESO account at maaaring suriin ng mga administrador ng PESO.',
    respondent: 'Tungkol sa inyong transaksyon', clientType: 'Uri ng kliyente', clientTypes: ['Mamamayan', 'Negosyo', 'Gobyerno (empleyado o ahensya)'], date: 'Petsa ng transaksyon', sex: 'Kasarian', sexes: ['Lalaki', 'Babae'], age: 'Edad', name: 'Pangalan (opsyonal)', address: 'Tirahan (opsyonal)', email: 'Email address (opsyonal)',
    charter: 'Citizen’s Charter', charterInstructions: 'Ang Citizen’s Charter ay isang opisyal na dokumento na naglalaman ng mga serbisyo sa isang ahensya/opisina ng gobyerno, mga kinakailangang dokumento, kaukulang bayarin, at pangkabuuang oras ng pagproseso.',
    cc1: 'CC1. Alin sa mga sumusunod ang naglalarawan sa iyong kaalaman sa Citizen’s Charter?',
    cc1Options: ['Alam ko ang CC at nakita ko ito sa napuntahang opisina.', 'Alam ko ang CC pero hindi ko ito nakita sa napuntahang opisina.', 'Nalaman ko ang CC nang makita ko ito sa napuntahang opisina.', 'Hindi ko alam kung ano ang CC at wala akong nakita sa napuntahang opisina.'],
    cc2: 'CC2. Kung alam ang Citizen’s Charter, masasabi mo ba na ang CC ng napuntahang opisina ay…?',
    cc2Options: ['Madaling makita', 'Medyo madaling makita', 'Mahirap makita', 'Hindi makita', 'Hindi angkop'],
    cc3: 'CC3. Kung alam ang Citizen’s Charter, gaano nakatulong ang CC sa transaksyon mo?',
    cc3Options: ['Sobrang nakatulong', 'Nakatulong naman', 'Hindi nakatulong', 'Hindi angkop'],
    charterSkipped: 'Nakatakda sa Hindi angkop ang CC2 at CC3 dahil pinili ninyo ang opsyon 4 sa CC1.',
    quality: 'Kalidad ng serbisyo', qualityInstructions: 'Para sa SQD0–SQD8, piliin ang sagot na pinakaangkop sa inyong karanasan.',
    ratingLabels: ['Labis na sumasang-ayon', 'Sumasang-ayon', 'Walang kinikilingan', 'Hindi sumasang-ayon', 'Lubos na hindi sumasang-ayon', 'N/A — Hindi angkop'],
    questions: [
      'Nasiyahan ako sa serbisyo na aking natanggap sa napuntahan na tanggapan.',
      'Makatwiran ang oras na aking ginugol para sa pagproseso ng aking transaksyon.',
      'Ang opisina ay sumusunod sa mga kinakailangang dokumento at mga hakbang batay sa impormasyong ibinigay.',
      'Ang mga hakbang sa pagproseso, kasama na ang pagbayad ay madali at simple lamang.',
      'Mabilis at madali akong nakahanap ng impormasyon tungkol sa aking transaksyon mula sa opisina o sa website nito.',
      'Nagbayad ako ng makatwirang halaga para sa aking transaksyon. (Kung libre ang serbisyo, piliin ang N/A.)',
      'Pakiramdam ko ay patas ang opisina sa lahat, o “walang palakasan”, sa aking transaksyon.',
      'Magalang akong trinato ng mga tauhan, at (kung sakali ako ay humingi ng tulong) alam ko na sila ay handang tumulong sa akin.',
      'Nakuha ko ang kinakailangan ko mula sa tanggapan ng gobyerno, kung tinanggihan man, ito ay sapat na ipinaliwanag sa akin.',
    ],
    suggestions: 'Mga suhestiyon kung paano pa mapapabuti ang aming mga serbisyo (opsyonal)', submit: 'Isumite ang puna sa PESO', submitting: 'Isinusumite…', back: 'Bumalik sa mga talatanungan', success: 'Maraming salamat! Naisumite na sa PESO ang inyong puna.', reference: 'Numero ng pagsusumite', submitted: 'Naisumite', another: 'Bumalik sa Reviews', required: 'Kinakailangan maliban kung opsyonal.', staff: 'Ang control number at mga detalye ng opisina/serbisyo sa orihinal na form ay para sa mga kawani ng PESO.',
  },
}

export function validateCsmResponse(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {}
  const values = {}, fieldErrors = {}
  const language = input.language === 'tl' ? 'tl' : 'en'
  const required = language === 'tl' ? 'Pumili o maglagay ng wastong sagot.' : 'Choose or enter a valid answer.'
  if (!['en', 'tl'].includes(input.language)) fieldErrors.language = required
  values.language = language
  for (const [key, choices] of Object.entries({ clientType: ['citizen', 'business', 'government'], sex: ['male', 'female'], cc1: ['1', '2', '3', '4'] })) {
    values[key] = typeof input[key] === 'string' ? input[key] : ''
    if (!choices.includes(values[key])) fieldErrors[key] = required
  }
  values.date = typeof input.date === 'string' ? input.date.trim() : ''
  if (!isValidCalendarDate(values.date) || values.date > todayInManila() || values.date < '2000-01-01') fieldErrors.date = language === 'tl' ? 'Maglagay ng wastong petsa na hindi lalampas sa araw na ito.' : 'Enter a valid transaction date on or before today.'
  values.age = /^\d{1,3}$/.test(String(input.age ?? '')) ? Number(input.age) : null
  if (values.age === null || values.age < 1 || values.age > 120) fieldErrors.age = language === 'tl' ? 'Maglagay ng edad mula 1 hanggang 120.' : 'Enter an age from 1 to 120.'
  values.cc2 = values.cc1 === '4' ? '5' : input.cc2
  values.cc3 = values.cc1 === '4' ? '4' : input.cc3
  if (!['1', '2', '3', '4', '5'].includes(values.cc2)) fieldErrors.cc2 = required
  if (!['1', '2', '3', '4'].includes(values.cc3)) fieldErrors.cc3 = required
  values.ratings = {}
  for (const key of CSM_QUESTION_KEYS) {
    values.ratings[key] = input.ratings?.[key]
    if (!CSM_RATING_VALUES.includes(values.ratings[key])) fieldErrors[`ratings.${key}`] = required
  }
  for (const [key, max] of Object.entries({ name: 150, address: 250, email: 254, suggestions: 2000 })) {
    values[key] = typeof input[key] === 'string' ? input[key].trim() : ''
    if ((input[key] !== undefined && typeof input[key] !== 'string') || values[key].length > max) fieldErrors[key] = language === 'tl' ? `Hanggang ${max} character lamang.` : `Use at most ${max} characters.`
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fieldErrors.email = language === 'tl' ? 'Maglagay ng wastong email address.' : 'Enter a valid email address.'
  return { values, fieldErrors }
}
