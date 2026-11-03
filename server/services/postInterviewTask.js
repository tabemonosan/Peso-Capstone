import mongoose from 'mongoose'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { Interview, PostInterviewFile } from '../models/applicationWorkflow.js'
import { ApplicationError } from './referralWorkflow.js'
import { POST_INTERVIEW_REQUIREMENTS, POST_INTERVIEW_FILE_MAX_BYTES } from '../../shared/postInterviewTask.js'

const fail = (code, message, status = 409) => { throw new ApplicationError(code, message, status) }
export function createPostInterviewTaskService({ workflow, HireReport, notify, now = () => new Date() }) {
  async function context(actor, interviewId) {
    if (!mongoose.isValidObjectId(interviewId)) fail('INVALID_RECORD', 'Choose a valid interview.', 403)
    const meeting = await Interview.findById(interviewId).lean()
    if (!meeting) fail('TASK_UNAVAILABLE', 'Interview unavailable.', 403)
    if (actor.role === 'Admin') return { meeting }
    const owned = await workflow.ownedReferral(actor, meeting.referralId)
    return { ...owned, meeting }
  }
  async function active(context) {
    const { meeting, referral } = context
    if (['withdrawn', 'withdrawn_by_admin', 'declined', 'declined_by_admin'].includes(referral?.status) || !['held', 'attended'].includes(meeting.status)) fail('TASK_UNAVAILABLE', 'Tasks are available only after a completed interview on an active application.')
    if (await HireReport.exists({ referralId: meeting.referralId, reportedByRole: { $ne: 'Applicant' } })) fail('OUTCOME_RECORDED', 'A hiring outcome has already been recorded.')
  }
  async function request(actor, interviewId, body) {
    if (actor.role !== 'Employer') fail('FORBIDDEN', 'Employers only.', 403)
    const owned = await context(actor, interviewId)
    await active(owned)
    const requirements = body.requirements
    if (!Array.isArray(requirements) || !requirements.length || requirements.length > 3 || requirements.some(key => typeof key !== 'string' || !Object.hasOwn(POST_INTERVIEW_REQUIREMENTS, key)) || new Set(requirements).size !== requirements.length) fail('INVALID_REQUIREMENTS', 'Choose one or more document requirements.', 422)
    if (typeof body.instructions !== 'string' || body.instructions.trim().length > 1000) fail('INVALID_INSTRUCTIONS', 'Use up to 1,000 characters for the applicant instructions.', 422)
    const at = now()
    const task = { status: 'requested', requirements, instructions: body.instructions.trim(), requestedAt: at, requestedBy: owned.account._id, files: {} }
    const changed = await Interview.findOneAndUpdate({ _id: interviewId, status: { $in: ['held', 'attended'] }, 'postInterviewTask.requestedAt': { $exists: false } }, { $set: { postInterviewTask: task }, $push: { history: { action: 'post_interview_task_requested', status: 'interview_held', by: 'Employer', at } } }, { returnDocument: 'after' }).lean()
    if (!changed) fail('TASK_CHANGED', 'A task already exists or the interview changed. Refresh to see the latest task.')
    await notify({ recipient: { id: changed.applicantId, role: 'Applicant' }, type: 'post_interview_task', title: 'Pre-employment documents requested', message: 'Your employer requested post-interview documents. Open My applications to view the instructions and upload files.', link: '/my-applications' })
    return changed
  }
  async function upload(actor, interviewId, key, file) {
    if (actor.role !== 'Applicant') fail('FORBIDDEN', 'Applicants only.', 403)
    const owned = await context(actor, interviewId)
    await active(owned)
    const task = owned.meeting.postInterviewTask
    if (!Object.hasOwn(POST_INTERVIEW_REQUIREMENTS, key) || !task?.requirements?.includes(key) || !['requested', 'submitted'].includes(task.status)) fail('TASK_UNAVAILABLE', 'This document is not requested or the task is already complete.')
    if (!file?.buffer?.length || file.buffer.length > POST_INTERVIEW_FILE_MAX_BYTES) fail('INVALID_FILE', 'Choose a PDF, JPG, or PNG file up to 5 MB.', 422)
    let data = file.buffer
    let mimetype = file.mimetype
    try {
      if (mimetype === 'application/pdf' && data.subarray(0, 5).toString() === '%PDF-') {
        const pdf = await PDFDocument.load(data)
        if (pdf.getPageCount() < 1 || pdf.getPageCount() > 10) throw new Error('pages')
      } else if (['image/jpeg', 'image/png'].includes(mimetype)) {
        const image = sharp(data, { limitInputPixels: 25000000 })
        const meta = await image.metadata()
        if (!['jpeg', 'png'].includes(meta.format) || `image/${meta.format}` !== mimetype) throw new Error('format')
        data = await image.rotate().toBuffer() // Drop EXIF/GPS and normalize orientation.
      } else throw new Error('format')
    } catch { fail('INVALID_FILE', 'Upload a readable PDF (up to 10 pages), JPG, or PNG file.', 422) }
    if (data.length > POST_INTERVIEW_FILE_MAX_BYTES) fail('INVALID_FILE', 'Choose a file up to 5 MB.', 422)
    const previous = task.files?.[key]
    const version = (previous?.version || 0) + 1
    if (version > 3) fail('UPLOAD_LIMIT', 'This requirement has reached its three-upload limit. Contact PESO for assistance.')
    const at = now(), expiresAt = new Date(+at + 90 * 86400000)
    const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[mimetype]
    const safeName = Array.from(String(file.originalname || 'document'), character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === '/' || character === '\\' ? '_' : character).join('')
    const name = (safeName.replace(/\.[^.]*$/, '').slice(0, 110) || 'document') + extension
    const saved = await PostInterviewFile.create({ interviewId, applicantId: owned.account._id, employerId: owned.meeting.employerId, requirementKey: key, version, name, mimetype, size: data.length, data, uploadedAt: at, expiresAt })
    const path = `postInterviewTask.files.${key}`
    const metadata = { id: saved._id, name, size: data.length, uploadedAt: at, expiresAt, version }
    const changed = await Interview.updateOne({ _id: interviewId, 'postInterviewTask.status': { $in: ['requested', 'submitted'] }, [`${path}.version`]: previous ? previous.version : { $exists: false } }, { $set: { [path]: metadata }, $push: { history: { action: 'post_interview_document_uploaded', status: 'interview_held', by: 'Applicant', at } } })
    if (!changed.modifiedCount) { await PostInterviewFile.deleteOne({ _id: saved._id }); fail('TASK_CHANGED', 'The task changed during upload. Refresh and try again.') }
    await Interview.updateOne({ _id: interviewId, 'postInterviewTask.status': 'requested', ...Object.fromEntries(task.requirements.map(requirement => [`postInterviewTask.files.${requirement}.id`, { $exists: true }])) }, { $set: { 'postInterviewTask.status': 'submitted' } })
    await notify({ recipient: { id: owned.meeting.employerId, role: 'Employer' }, type: 'post_interview_document', title: 'Post-interview document uploaded', message: 'An applicant uploaded a requested pre-employment document. Open Applications and referrals to review it.', link: '/referrals' })
    return Interview.findById(interviewId).lean()
  }
  async function complete(actor, interviewId, body = {}) {
    if (actor.role !== 'Employer') fail('FORBIDDEN', 'Employers only.', 403)
    const owned = await context(actor, interviewId)
    await active(owned)
    const task = owned.meeting.postInterviewTask
    if (task?.status !== 'submitted') fail('DOCUMENTS_INCOMPLETE', 'Wait for every requested document before marking the task complete.')
    if (!body.files || task.requirements.some(key => body.files[key] !== String(task.files?.[key]?.id))) fail('TASK_CHANGED', 'The documents changed or the review is out of date. Refresh and review the current files before confirming completion.')
    if (task.requirements.some(key => !task.files?.[key]?.expiresAt || +task.files[key].expiresAt <= +now())) fail('FILES_EXPIRED', 'One or more files have expired. Ask the applicant to upload current copies.')
    if (await PostInterviewFile.countDocuments({ _id: { $in: task.requirements.map(key => task.files[key].id) }, interviewId, expiresAt: { $gt: now() } }) !== task.requirements.length) fail('FILES_EXPIRED', 'One or more files are no longer available. Ask the applicant to upload current copies.')
    const at = now()
    const match = { _id: interviewId, 'postInterviewTask.status': 'submitted', ...Object.fromEntries(task.requirements.map(key => [`postInterviewTask.files.${key}.id`, task.files[key].id])) }
    const changed = await Interview.findOneAndUpdate(match, { $set: { 'postInterviewTask.status': 'completed', 'postInterviewTask.completedAt': at, 'postInterviewTask.completedBy': owned.account._id }, $push: { history: { action: 'post_interview_task_completed', status: 'interview_held', by: 'Employer', at } } }, { returnDocument: 'after' }).lean()
    if (!changed) fail('TASK_CHANGED', 'The documents changed while you reviewed them. Refresh before confirming completion.')
    await notify({ recipient: { id: changed.applicantId, role: 'Applicant' }, type: 'post_interview_task_complete', title: 'Pre-employment documents reviewed', message: 'The employer marked your post-interview document task complete. This is separate from the final hiring outcome.', link: '/my-applications' })
    return changed
  }
  async function download(actor, interviewId, fileId) {
    const { meeting } = await context(actor, interviewId)
    if (!mongoose.isValidObjectId(fileId) || !Object.values(meeting.postInterviewTask?.files || {}).some(file => String(file.id) === fileId)) fail('FILE_UNAVAILABLE', 'This file is unavailable.', 403)
    const file = await PostInterviewFile.findOne({ _id: fileId, interviewId }).select('+data').lean()
    if (!file || +file.expiresAt <= +now()) fail('FILE_EXPIRED', 'This file has expired or is no longer available.', 410)
    return file
  }
  return { context, request, upload, complete, download }
}
