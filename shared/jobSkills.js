// Approved employer job skills, shared by the picker and server validation.
import { NSRP_SKILL_LABELS, NSRP_SKILL_OTHERS_LABEL } from './nsrpSkills.js'

export const JOB_SKILL_OPTIONS = [...new Set([
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Web Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "Cybersecurity Analyst",
  "IT Support Specialist",
  "Network Engineer",
  "Database Administrator",
  "QA Engineer",
  "UI/UX Designer",
  "Product Manager",
  "Project Manager",
  "Business Analyst",
  "Accountant",
  "Financial Analyst",
  "Bookkeeper",
  "Human Resources Specialist",
  "Recruiter",
  "Sales Representative",
  "Account Manager",
  "Marketing Specialist",
  "Digital Marketing Specialist",
  "Social Media Manager",
  "Content Writer",
  "Copywriter",
  "Graphic Designer",
  "Video Editor",
  "Customer Service Representative",
  "Call Center Agent",
  "Virtual Assistant",
  "Administrative Assistant",
  "Executive Assistant",
  "Office Clerk",
  "Data Entry Specialist",
  "Operations Manager",
  "Supply Chain Specialist",
  "Logistics Coordinator",
  "Warehouse Associate",
  "Delivery Driver",
  "Professional Driver",
  "Security Guard",
  "Cashier",
  "Retail Associate",
  "Store Manager",
  "Chef",
  "Cook",
  "Baker",
  "Waiter / Waitress",
  "Barista",
  "Housekeeper",
  "Janitor",
  "Caregiver",
  "Nurse",
  "Medical Technologist",
  "Pharmacist",
  "Teacher",
  "Tutor",
  "Electrician",
  "Plumber",
  "Carpenter",
  "Welder",
  "Mechanic",
  "Construction Worker",
  "Civil Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Architect",
  "Landscaper",
  "Farm Worker",
  "Excel",
  "Word",
  "PowerPoint",
  "Microsoft Office",
  "Communication",
  "Sales",
  "Data Entry",
  "Administration",
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "SQL",
  "HTML",
  "CSS",
  "React",
  "Node.js",
  "UI Designer",
  "UX Designer",
  "Digital Marketing",
  "SEO",
  "Search Engine Marketing",
  "Email Marketing",
  "Social Media Marketing",
  "Bookkeeping",
  "Accounting",
  "Customer Service",
  "Time Management",
  "Teamwork",
  "Problem Solving",
  "Leadership",
  "Inventory Management",
  "Food Preparation",
  "Food Safety",
  "Welding",
  "Carpentry",
  "Plumbing",
  "Electrical Installation",
  "Computer Literate",
  // Reuse the NSRP catalog so additions appear in the job picker and validator.
  // "Others" is a form category, not a specific approved skill.
  ...NSRP_SKILL_LABELS.filter((label) => label !== NSRP_SKILL_OTHERS_LABEL),
])]

// Only explicit coverage relationships are used. Job titles such as Software
// Engineer do not imply unrelated specialties or every programming language.
export const JOB_SKILL_COVERAGE = {
  'Full-Stack Developer': ['Frontend Developer', 'Backend Developer'],
  'UI/UX Designer': ['UI Designer', 'UX Designer'],
  'Microsoft Office': ['Excel', 'Word', 'PowerPoint'],
  'Digital Marketing': ['SEO', 'Search Engine Marketing', 'Email Marketing', 'Social Media Marketing'],
}

export const normalizeJobSkill = (label) => String(label || '').trim().replace(/[-/\s]+/g, ' ').toLowerCase()
const catalog = new Map(JOB_SKILL_OPTIONS.map((label) => [normalizeJobSkill(label), label]))
export const canonicalJobSkill = (label) => catalog.get(normalizeJobSkill(label)) || ''

export function coveringJobSkill(skill, selected = []) {
  const target = canonicalJobSkill(skill)
  if (!target) return ''
  const covers = (parent) => (JOB_SKILL_COVERAGE[parent] || []).some((child) => child === target || covers(child))
  return selected.map(canonicalJobSkill).find((parent) => parent && parent !== target && covers(parent)) || ''
}

export function addJobSkill(selected, candidate) {
  const label = canonicalJobSkill(candidate)
  if (!label) return { error: 'Choose a skill from the approved list. Custom skills are not allowed.' }
  const parent = coveringJobSkill(label, selected)
  if (parent) return { error: `${label} is already covered by ${parent}.` }
  const removed = selected.filter((entry) => coveringJobSkill(entry, [label]))
  const skills = selected.filter((entry) => !removed.includes(entry) && canonicalJobSkill(entry) !== label)
  return { skills: [...skills, label], removed }
}

// A saved broader skill covers its explicit children, never the reverse.
export function applicantJobSkills(skills = []) {
  const expanded = new Set()
  const visit = (label) => {
    if (typeof label !== 'string' || !label.trim()) return
    const normalized = normalizeJobSkill(label)
    if (expanded.has(normalized)) return
    expanded.add(normalized)
    for (const child of JOB_SKILL_COVERAGE[canonicalJobSkill(label)] || []) visit(child)
  }
  for (const skill of Array.isArray(skills) ? skills : []) visit(skill)
  return [...expanded]
}

export function jobSkillMatchCount(required = [], saved = []) {
  const available = new Set(applicantJobSkills(saved))
  return new Set((Array.isArray(required) ? required : []).filter((skill) => typeof skill === 'string').map(normalizeJobSkill).filter((skill) => available.has(skill))).size
}
