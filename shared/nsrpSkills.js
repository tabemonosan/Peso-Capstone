// Single source of truth for NSRP Form 1 Section VIII skill options.
// Used by the wizard (src), server validation (server/index.js), and the PDF
// generator (server/nsrpPdf.js) so the option labels and the PDF layout keys
// can never drift apart. Dependency-free ESM.

export const NSRP_SKILLS = [
  { label: 'Auto Mechanic', layoutKey: 'skillAutoMechanic' },
  { label: 'Beautician', layoutKey: 'skillBeautician' },
  { label: 'Carpentry Work', layoutKey: 'skillCarpentryWork' },
  { label: 'Computer Literate', layoutKey: 'skillComputerLiterate' },
  { label: 'Domestic Chores', layoutKey: 'skillDomesticChores' },
  { label: 'Driver', layoutKey: 'skillDriver' },
  { label: 'Electrician', layoutKey: 'skillElectrician' },
  { label: 'Embroidery', layoutKey: 'skillEmbroidery' },
  { label: 'Gardening', layoutKey: 'skillGardening' },
  { label: 'Masonry', layoutKey: 'skillMasonry' },
  { label: 'Painter/Artist', layoutKey: 'skillPainterArtist' },
  { label: 'Painting Jobs', layoutKey: 'skillPaintingJobs' },
  { label: 'Photography', layoutKey: 'skillPhotography' },
  { label: 'Plumbing', layoutKey: 'skillPlumbing' },
  { label: 'Sewing Dresses', layoutKey: 'skillSewingDresses' },
  { label: 'Stenography', layoutKey: 'skillStenography' },
  { label: 'Tailoring', layoutKey: 'skillTailoring' },
  { label: 'Others', layoutKey: 'skillOthers' },
]

export const NSRP_SKILL_LABELS = NSRP_SKILLS.map((skill) => skill.label)

export const NSRP_SKILL_OTHERS_LABEL = 'Others'

// Normalize a skill string for matching: trim, collapse whitespace, lowercase.
export const normalizeSkillLabel = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

// normalized label -> PDF layout checkbox key (includes "Others" -> skillOthers)
export const NSRP_SKILL_LAYOUT_KEY = new Map(
  NSRP_SKILLS.map(({ label, layoutKey }) => [normalizeSkillLabel(label), layoutKey]),
)
