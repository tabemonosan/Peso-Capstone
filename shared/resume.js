import { RESUME_MAX_BYTES, RESUME_TYPES } from './jobApplication.js'

export const RESUME_ACCEPT = '.pdf,.docx'
export function resumeError(file) {
  if (!file) return 'Choose a resume to upload.'
  const extension = String(file.name || file.originalname || '').toLowerCase().match(/\.[^.]+$/)?.[0]
  if (!RESUME_TYPES[extension] || (file.type || file.mimetype) !== RESUME_TYPES[extension]) return 'Upload a PDF or DOCX resume.'
  if (!file.size || file.size > RESUME_MAX_BYTES) return 'Your resume must be between 1 byte and 5 MB.'
  return ''
}
