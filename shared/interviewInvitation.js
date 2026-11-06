import { PH_LOCATIONS, getEmployerJobAddress } from './phLocations.js'

export function registeredInterviewAddress(employer = {}, request = {}) {
  const address = getEmployerJobAddress(employer, request)
  const landmark = employer.profile?.landmark || request.registrationDetails?.landmark
    || employer.profile?.location?.match(/Landmark\s*:\s*(.+)$/i)?.[1]?.trim()
    || request.location?.match(/Landmark\s*:\s*(.+)$/i)?.[1]?.trim() || ''
  return { ...address, landmark }
}

export const INTERVIEW_MAX_DAYS = 365
export const philippineDateTimeInput = date => new Date(+new Date(date) + 8 * 3600000).toISOString().slice(0, 16)
export const nextInterviewMinute = (now = Date.now()) => new Date((Math.floor(+new Date(now) / 60000) + 1) * 60000)

export function validateInterviewInvitation(body = {}, now = new Date()) {
  const text = key => typeof body[key] === 'string' ? body[key].trim() : ''
  const value = { scheduledAt: new Date(body.scheduledAt), mode: text('mode'), city: text('city'), barangay: text('barangay'), province: text('province'), landmark: text('landmark'), meetingLink: text('meetingLink'), message: text('message') }
  const errors = {}
  if (!Number.isFinite(+value.scheduledAt) || +value.scheduledAt <= +now || +value.scheduledAt > +now + INTERVIEW_MAX_DAYS * 86400000) errors.scheduledAt = 'Choose a future interview time within the next 365 days.'
  if (!['In person', 'Online'].includes(value.mode)) errors.mode = 'Choose an interview mode.'
  if (value.province !== 'Albay') errors.province = 'Select Albay.'
  if (!Object.hasOwn(PH_LOCATIONS, value.city)) errors.city = 'Select a municipality or city in Albay.'
  if (errors.city || !PH_LOCATIONS[value.city].includes(value.barangay)) errors.barangay = 'Select a barangay belonging to the municipality or city.'
  if (value.landmark.length > 200) errors.landmark = 'Use 200 characters or fewer for the landmark.'
  if (value.message.length > 50) errors.message = 'Use 50 characters or fewer for the message.'
  if (value.mode === 'Online') {
    try {
      const url = new URL(value.meetingLink)
      if (!['https:', 'http:'].includes(url.protocol) || value.meetingLink.length > 500) throw new Error('Invalid meeting link')
    } catch { errors.meetingLink = 'Enter a valid http or https meeting link.' }
  } else value.meetingLink = ''
  const address = [value.barangay, value.city, value.province, value.landmark ? `Landmark: ${value.landmark}` : ''].filter(Boolean).join(', ')
  value.location = value.mode === 'Online' ? `${value.meetingLink} | ${address}` : address
  return { value, errors }
}
