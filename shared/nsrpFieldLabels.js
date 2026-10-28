// Applicant-friendly labels and grouping for NSRP print-fit warnings.
// Turns raw generator field paths (e.g. "technicalTraining[0].duration")
// into readable names (e.g. "Training #1: Duration") and groups warnings
// by form section, in the order sections appear on the printed form.

// Form sections in the order they appear on NSRP Form 1.
export const NSRP_WARNING_SECTIONS = [
  { key: 'personal', title: 'Personal Information' },
  { key: 'address', title: 'Address & Contact' },
  { key: 'jobPreference', title: 'Job Preference' },
  { key: 'languages', title: 'Languages' },
  { key: 'education', title: 'Educational Background' },
  { key: 'technicalTraining', title: 'Technical/Vocational Training' },
  { key: 'eligibility', title: 'Eligibility / Professional License' },
  { key: 'workExperience', title: 'Work Experience' },
  { key: 'skills', title: 'Other Skills' },
]

// Wizard step (0-based) that contains each section, matching nsrpSteps in JobsView.
export const NSRP_SECTION_WIZARD_STEP = {
  personal: 0,
  address: 1,
  education: 2,
  technicalTraining: 2,
  eligibility: 2,
  workExperience: 3,
  skills: 3,
  languages: 3,
  jobPreference: 4,
  employment: 4,
}

// Labels for the flat (non-table) text fields, matching the wizard wording.
export const NSRP_FLAT_FIELD_LABELS = {
  surname: 'Surname',
  firstName: 'First name',
  middleName: 'Middle name',
  suffix: 'Suffix',
  dob: 'Date of birth',
  placeOfBirth: 'Place of birth',
  religion: 'Religion',
  addressStreet: 'Present address: House No. / Street',
  addressBarangay: 'Present address: Barangay',
  addressCity: 'Present address: City/Municipality',
  addressProvince: 'Present address: Province',
  tin: 'TIN',
  height: 'Height',
  gsisSss: 'GSIS/SSS No.',
  email: 'Email address',
  pagibig: 'Pag-IBIG No.',
  landline: 'Landline',
  philhealth: 'PhilHealth No.',
  cellphone: 'Cellphone number',
  disability: 'Disability (specify)',
  terminatedAbroadCountry: 'Country of termination (abroad)',
  employmentTypeOther: 'Other employment type',
  lookingDuration: 'How long looking for work',
  willingWhen: 'When willing to start',
  fourPsId: '4Ps Household ID No.',
  occupation1: 'Preferred occupation 1',
  occupation2: 'Preferred occupation 2',
  occupation3: 'Preferred occupation 3',
  occupation4: 'Preferred occupation 4',
  localPref1: 'Local work location 1',
  localPref2: 'Local work location 2',
  localPref3: 'Local work location 3',
  overseasPref1: 'Overseas country 1',
  overseasPref2: 'Overseas country 2',
  overseasPref3: 'Overseas country 3',
  expectedSalary: 'Expected salary',
  passportNo: 'Passport No.',
  passportExpiry: 'Passport expiry',
  languageOther: 'Other language',
  skillOthersText: 'Other skills (specify)',
}

// Labels for table-row fields. Row naming can depend on the column
// (eligibility rows are civil-service entries on the left and PRC licenses on the right).
const NSRP_TABLE_SECTIONS = {
  education: {
    section: 'education',
    rowName: () => 'education',
    fields: {
      school: 'School',
      course: 'Course / degree',
      year: 'Year graduated',
      undergradLevel: 'If undergraduate, what level?',
      yearLastAttended: 'Year last attended',
      awards: 'Awards received',
    },
  },
  technicalTraining: {
    section: 'technicalTraining',
    rowName: () => 'Training',
    fields: {
      course: 'Course',
      duration: 'Duration',
      fromDate: 'Duration (from)',
      toDate: 'Duration (to)',
      institution: 'Institution',
      certificate: 'Certificate received',
    },
  },
  eligibility: {
    section: 'eligibility',
    rowName: (field) => (field === 'license' || field === 'validUntil' ? 'Professional license' : 'Eligibility'),
    fields: {
      eligibility: 'Civil service eligibility',
      rating: 'Rating',
      examDate: 'Date of exam',
      license: 'License',
      validUntil: 'Valid until',
    },
  },
  workExperience: {
    section: 'workExperience',
    rowName: () => 'Work experience',
    fields: {
      company: 'Company name',
      address: 'Address',
      position: 'Position',
      status: 'Status',
      fromDate: 'Start date',
      toDate: 'End date',
      'fromDate/toDate': 'Inclusive dates',
    },
  },
}

const PATH_RE = /^([A-Za-z]+)(?:\[([^\]]+)\])?(?:\.(.+))?$/

const capitalize = (word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word)

const humanize = (word) =>
  String(word || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[/_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Which warning section a path belongs to (drives grouping and order).
export function getNsrpWarningSection(path) {
  const match = PATH_RE.exec(String(path || ''))
  if (!match) return 'personal'
  const [, base] = match
  if (NSRP_TABLE_SECTIONS[base]) return NSRP_TABLE_SECTIONS[base].section
  if (/^(occupation|localPref|overseasPref)/.test(base) || ['expectedSalary', 'passportNo', 'passportExpiry'].includes(base)) return 'jobPreference'
  if (/^address/.test(base) || ['tin', 'gsisSss', 'pagibig', 'philhealth', 'email', 'cellphone', 'landline'].includes(base)) return 'address'
  if (/^language/.test(base)) return 'languages'
  if (/^skill/.test(base) || base === 'othersText') return 'skills'
  return 'personal'
}

// Human-readable label for a raw generator field path.
// Array indexes become 1-based row numbers: technicalTraining[0].duration -> "Training #1: Duration".
// education rows are keyed by level: education[Tertiary].school -> "Tertiary education: School".
export function getNsrpFieldLabel(path) {
  const raw = String(path || '')
  const match = PATH_RE.exec(raw)
  if (!match) return capitalize(humanize(raw)) || 'Field'
  const [, base, rowKey, field] = match

  if (rowKey !== undefined && NSRP_TABLE_SECTIONS[base]) {
    const spec = NSRP_TABLE_SECTIONS[base]
    const fieldLabel = spec.fields[field] || capitalize(humanize(field))
    if (base === 'education') {
      return `${capitalize(humanize(rowKey))} education: ${fieldLabel}`
    }
    const rowNumber = Number.parseInt(rowKey, 10)
    const rowName = spec.rowName(field)
    const prefix = Number.isNaN(rowNumber) ? capitalize(rowName) : `${capitalize(rowName)} #${rowNumber + 1}`
    return `${prefix}: ${fieldLabel}`
  }

  if (NSRP_FLAT_FIELD_LABELS[base]) return NSRP_FLAT_FIELD_LABELS[base]
  // Fallback for unknown paths: spaced, capitalized words, 1-based row numbers,
  // never brackets or camelCase.
  const rowNumber = Number.parseInt(rowKey, 10)
  const prefix = rowKey !== undefined && !Number.isNaN(rowNumber)
    ? `${capitalize(humanize(base))} #${rowNumber + 1}`
    : capitalize(humanize(base))
  return [prefix, capitalize(humanize(field))].filter(Boolean).join(': ')
}

// Plain-language messages per warning severity.
export const NSRP_WARNING_MESSAGES = {
  truncated: 'Too long, so the end will be cut off on the printed form. Please shorten it.',
  'minimum-font-size': 'The text is very small on the printed form. Try shortening it.',
}

export const NSRP_WARNING_SEVERITY = {
  truncated: { key: 'truncated', title: 'Will be cut off' },
  'minimum-font-size': { key: 'minimum-font-size', title: 'Printed small' },
}

// Above this many warnings, the UI collapses the list behind a toggle.
export const NSRP_WARNING_COLLAPSE_THRESHOLD = 3

// Summary line, e.g. "8 entries need attention: 4 will be cut off, 4 printed small".
export function summarizeNsrpWarnings(warnings) {
  const list = warnings || []
  const cutOff = list.filter((warning) => warning.reason === 'truncated').length
  const small = list.length - cutOff
  const parts = []
  if (cutOff) parts.push(`${cutOff} will be cut off`)
  if (small) parts.push(`${small} printed small`)
  return `${list.length} ${list.length === 1 ? 'entry needs' : 'entries need'} attention${parts.length ? `: ${parts.join(', ')}` : ''}`
}

// Group warnings by form section (form order). Within each group, "cut off"
// entries come before "printed small" ones.
export function groupNsrpWarnings(warnings) {
  const groups = new Map()
  for (const warning of warnings || []) {
    const sectionKey = getNsrpWarningSection(warning.field)
    if (!groups.has(sectionKey)) groups.set(sectionKey, [])
    groups.get(sectionKey).push(warning)
  }
  return NSRP_WARNING_SECTIONS
    .filter(({ key }) => groups.has(key))
    .map(({ key, title }) => {
      const items = groups.get(key).slice().sort((a, b) => {
        const rank = (w) => (w.reason === 'truncated' ? 0 : 1)
        return rank(a) - rank(b)
      })
      return { key, title, items, count: items.length }
    })
}
