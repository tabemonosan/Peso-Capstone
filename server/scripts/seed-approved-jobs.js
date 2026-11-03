import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { Applicant, Employer, Admin, Referral, HireReport, Notification } from '../models/collections.js'
import { Interview, ApplicationReport, ApplicationAppeal } from '../models/applicationWorkflow.js'
import { createReferralWorkflow } from '../services/referralWorkflow.js'
import { createApplicationWorkflow } from '../services/applicationWorkflow.js'

// Retains the existing approved-posting examples, now attached only to a fake employer.
const JOB_EXAMPLES = [
    { title: 'Warehouse Staff', location: 'Legazpi City', skills: ['Construction', 'Driving'] },
    { title: 'Kitchen Assistant', location: 'Daraga', skills: ['Cooking', 'Cleaning'] },
    { title: 'Home Care Aide', location: 'Tabaco City', skills: ['Caregiving', 'Customer Service'] },
    { title: 'Office Encoder', location: 'Ligao City', skills: ['Data Entry', 'Customer Service'] },
    { title: 'Delivery Rider', location: 'Polangui', skills: ['Driving', 'Customer Service'] },
    { title: 'Janitorial Personnel', location: 'Legazpi City', skills: ['Cleaning'] },
    { title: 'Landscaping Worker', location: 'Camalig', skills: ['Landscaping', 'Construction'] },
    { title: 'Front Desk Assistant', location: 'Sto. Domingo', skills: ['Customer Service', 'Data Entry'] },
    { title: 'Production Helper', location: 'Guinobatan', skills: ['Construction', 'Cleaning'] },
    { title: 'Cook', location: 'Legazpi City', skills: ['Cooking', 'Customer Service'] },
  ]
const DAY = 86400000
const fakeFile = () => ({ originalName: 'demo.pdf', mimetype: 'application/pdf', size: 14, data: Buffer.from('%PDF-demo-only'), version: 1, status: 'approved', sourceType: 'generated' })
export const FULL_CYCLE_COUNTS = { applications: 7, applicationsByStatus: { delivered: 6, pending_admin: 1 }, interviews: { scheduled: 2, held: 1 }, reports: { noShowPending: 1, noShowConfirmed: 1, noShowDismissed: 1, problemPending: 1, problemTotal: 1 }, referralsBySource: { auto: 5, admin: 1 }, suspendedApplicants: 1 }

export async function seedApprovedJobs({ employer, admin, now = new Date(), count = 10 }) {
  const JobPosting = mongoose.model('JobPosting')
  return JobPosting.insertMany(JOB_EXAMPLES.slice(0, count).map((job, index) => ({ ...job, company: employer.companyName, createdBy: employer.email, description: 'Fictional demonstration posting ' + (index + 1), requirements: 'Relevant experience preferred.', salary: 'Php 12,000 - 18,000', status: 'approved', approvedBy: admin.email, approvedAt: now, slots: 20, deadline: new Date(+now + 30 * DAY), applicants: [] })))
}

export async function seedFullCycle({ tag = crypto.randomBytes(5).toString('hex'), now = new Date() } = {}) {
  if (!/^[a-z0-9-]+$/i.test(tag)) throw new Error('Use an alphanumeric demo tag.')
  const JobPosting = mongoose.model('JobPosting'), JobApplication = mongoose.model('JobApplication')
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 4)
  const admin = await Admin.create({ email: 'admin-' + tag + '@example.invalid', passwordHash })
  const employer = await Employer.create({ email: 'employer-' + tag + '@example.invalid', passwordHash, companyName: 'Fictional Demo Company ' + tag, emailVerified: true, verificationStatus: 'approved', phone: '09170000000' })
  const jobs = await seedApprovedJobs({ employer, admin, now, count: 1 }), job = jobs[0]
  const applicants = []
  for (let index = 0; index < 7; index++) applicants.push(await Applicant.create({ email: 'applicant-' + index + '-' + tag + '@example.invalid', passwordHash, emailVerified: true, verificationStatus: 'approved', phone: '09171234567', profile: { firstName: 'Demo ' + (index + 1), lastName: 'Applicant', location: 'Albay', skills: ['Driving'], nsrp: { surname: 'Applicant', firstName: 'Demo', skills: ['Driving'] } }, verificationDocuments: Object.fromEntries(['nsrpForm', 'birthCertificate', 'validId1'].map(key => [key, { uploads: 1, versions: [{ ...fakeFile(), sourceType: key === 'nsrpForm' ? 'generated' : undefined }] }])) }))
  // No SMTP or external service is used by this fixture.
  const notify = async value => Notification.create({ ...value, email: undefined })
  const notifyAdmins = async value => notify({ ...value, recipient: { id: admin._id, role: 'Admin' } })
  const loadEmployerVerification = async email => ({ employer: await Employer.findOne({ email }).lean(), status: 'approved' })
  const referralWorkflow = createReferralWorkflow({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Notification, notify, notifyAdmins, loadApplicant: email => Applicant.findOne({ email }).lean(), loadEmployerVerification, loadNsrpFile: async () => fakeFile() })
  const workflow = createApplicationWorkflow({ Applicant, Employer, JobPosting, JobApplication, Referral, HireReport, Interview, ApplicationReport, ApplicationAppeal, notify, notifyAdmins, loadEmployerVerification, referralWorkflow, now: () => now })
  const adminActor = { role: 'Admin', email: admin.email, id: admin._id }, employerActor = { role: 'Employer', email: employer.email }
  const actor = applicant => ({ role: 'Applicant', email: applicant.email })
  await referralWorkflow.setAutomatic(true, admin.email)
  await referralWorkflow.setLowTrustRouting(false, admin.email)
  const applications = [], referrals = [], meetings = []
  for (let index = 0; index < 6; index++) {
    const account = applicants[index]
    await referralWorkflow.submit({ email: account.email, jobId: job._id, sharingConsent: true, ip: 'fake-seed', ...(index === 2 ? { source: 'admin', adminId: admin._id, adminEmail: admin.email, reason: 'Demo manual referral' } : {}), nsrpFile: fakeFile(), resumeFile: fakeFile(), applicationDetails: { email: account.email, mobile: account.phone, bachelorDegree: 'No', hasExperience: 'No', experience: '' } })
    const application = await JobApplication.findOne({ applicantId: account._id }), referral = await Referral.findOne({ applicantId: account._id })
    applications.push(application); referrals.push(referral)
    const meeting = await workflow.invite(employerActor, referral._id, { scheduledAt: new Date(+now + DAY), mode: 'In person', city: 'Manito', barangay: 'Nagotgot', province: 'Albay', landmark: 'Fictional demo office', message: 'Demonstration invitation' })
    meetings.push(meeting)
    if (index < 3 || index === 4) {
      await workflow.respondInterview(actor(account), meeting._id, { action: 'confirm' })
      await Interview.updateOne({ _id: meeting._id }, { scheduledAt: new Date(+now - DAY) })
    }
  }
  await workflow.held(employerActor, meetings[0]._id)
  await workflow.confirmEvent(adminActor, { applicantId: applicants[0]._id, referenceId: meetings[0]._id, type: 'attended_interview', reason: 'Demo attendance verified' })
  await Referral.updateOne({ _id: referrals[0]._id }, { $set: { status: 'accepted' }, $push: { history: { action: 'employer_response', status: 'accepted', by: 'Employer', at: now } } })
  const hire = await HireReport.create({ referralId: referrals[0]._id, jobId: job._id, applicantId: applicants[0]._id, employerId: employer._id, reportedByRole: 'Employer', status: 'hired', notes: 'Demo private employer note', reportedAt: now })
  await workflow.confirmEvent(adminActor, { applicantId: applicants[0]._id, referenceId: hire._id, type: 'hired', reason: 'Demo hire verified' })
  await JobPosting.updateOne({ _id: job._id }, { $addToSet: { hiredApplicantIds: applicants[0]._id } })
  for (const index of [1, 2, 4]) {
    const report = await workflow.report(employerActor, { referralId: referrals[index]._id, type: 'no_show', reason: 'Fictional missed interview report' })
    if (index !== 4) {
      await workflow.respondNoShow(actor(applicants[index]), report.id, { response: index === 1 ? 'Demo evidence of attendance' : 'Demo applicant explanation' })
      await workflow.reviewReport(adminActor, report.id, { decision: index === 1 ? 'dismissed' : 'confirmed', reason: index === 1 ? 'Demo evidence supports dismissal' : 'Demo review confirms missed interview' })
    }
  }
  await workflow.report(actor(applicants[3]), { referralId: referrals[3]._id, type: 'problem', reason: 'Fictional problem for admin review' })
  await workflow.suspendApplicant(adminActor, applicants[5]._id, { suspended: true, reason: 'Fictional demo suspension, appeal available' })
  await workflow.confirmEvent(adminActor, { applicantId: applicants[6]._id, type: 'manual_adjustment', delta: -60, eventKey: 'demo-adjustment-' + tag, reason: 'Demo internal routing fixture' })
  // Capture one queued example through the real routing path; leave the setting OFF.
  await referralWorkflow.setLowTrustRouting(true, admin.email)
  await referralWorkflow.submit({ email: applicants[6].email, jobId: job._id, sharingConsent: true, ip: 'fake-seed', nsrpFile: fakeFile(), resumeFile: fakeFile(), applicationDetails: { email: applicants[6].email, mobile: applicants[6].phone, bachelorDegree: 'No', hasExperience: 'No', experience: '' } })
  await referralWorkflow.setLowTrustRouting(false, admin.email)
  applications.push(await JobApplication.findOne({ applicantId: applicants[6]._id }))
  return { admin, employer, applicants, job, applications, referrals, meetings, hire, expectedCounts: FULL_CYCLE_COUNTS }
}

async function run() {
  // Explicitly separate fake fixtures from the application's configured database.
  const database = process.argv.find(value => value.startsWith('--database='))?.slice(11)
  if (!database || !/^peso-demo-[a-z0-9-]+$/i.test(database)) throw new Error('Choose a demo database: --database=peso-demo-workflow')
  process.env.NODE_ENV = 'test'
  await import('../index.js') // reuse the existing registered posting/application models; no listener
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017', { dbName: database })
  try { const fixture = await seedFullCycle(); console.log('Created fake workflow cycle in ' + database, fixture.expectedCounts) }
  finally { await mongoose.disconnect() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch(error => { console.error('Seeding failed:', error.message); process.exitCode = 1 })
