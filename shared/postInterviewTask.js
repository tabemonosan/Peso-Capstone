export const POST_INTERVIEW_REQUIREMENTS = {
  background_authorization: 'Background-check authorization form',
  qualifications: 'Proof of certifications or degrees',
  identity: 'Identity verification document',
}
export const POST_INTERVIEW_FILE_MAX_BYTES = 5 * 1024 * 1024
export function publicPostInterviewTask(task) {
  if (!task?.requestedAt) return null
  return {
    status: task.status, instructions: task.instructions || '', requestedAt: task.requestedAt, completedAt: task.completedAt || null,
    requirements: (task.requirements || []).filter(key => Object.hasOwn(POST_INTERVIEW_REQUIREMENTS, key)).map(key => {
      const file = task.files?.[key]
      return { key, label: POST_INTERVIEW_REQUIREMENTS[key], file: file ? { id: String(file.id), name: file.name, size: file.size, uploadedAt: file.uploadedAt, expiresAt: file.expiresAt, version: file.version } : null }
    }),
  }
}
