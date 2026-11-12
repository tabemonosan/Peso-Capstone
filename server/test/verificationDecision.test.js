// @vitest-environment node
import { it, expect } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { PhilSysQrSignatureProvider, ThirdPartyEkycProvider, MockEkycProvider } from '../services/verificationProviders.js'
import { decisionReason } from '../../shared/verificationDecision.js'
import { VERIFICATION_DEFAULTS } from '../../shared/verification.js'
const context = () => ({ settings: VERIFICATION_DEFAULTS, docKey: 'validId1', document: { version: 1, status: 'pending', quality: { passed: true, warnings: [] } }, account: { emailVerified: true }, comparisons: ['name', 'birth date'].map(fieldGroup => ({ fieldGroup, result: 'match', evidence: 'independent' })) })
it.each(['placeOfBirth', 'idNumber', 'sex', 'address', 'dob'])('ignores legacy %s comparison flags for identity approval', field => {
 const c = context()
 c.findings = [{ ruleId: `cross_id_nsrp_${field}`, severity: 'critical', status: 'open', approvalBlocking: true }]
 expect(decisionReason(c)).toBe('')
})
it.each(['name'])('requires independent matching %s evidence', fieldGroup => {
 const c = context(); c.comparisons = c.comparisons.filter(row => row.fieldGroup !== fieldGroup)
 c.comparisons.push({ fieldGroup: 'ID number', result: 'match', evidence: 'independent' })
 expect(decisionReason(c)).toBe('Not independent')
})
it.each(['declared_id_nsrp_difference', 'id_number_format', 'id_expired', 'national_id_screenshot'])('keeps %s advisory for identity approval', ruleId => {
 const c = context(); c.findings = [{ ruleId, severity: 'warning', status: 'open' }]
 expect(decisionReason(c)).toBe('')
})
it.each([
 ['shared phone', c => { c.findings = [{ ruleId: 'duplicate_mobile', severity: 'warning', status: 'open' }] }, ''],
 ['legacy shared phone', c => { c.findings = [{ code: 'duplicate_phone', severity: 'critical', status: 'open' }] }, ''],
 ['master off', c => { c.settings = { ...c.settings, automaticApproval: false } }, 'Auto-approval off'],
 ['type off', c => { c.settings = { ...c.settings, validId: false } }, 'Auto-approval off'],
 ['engine off', c => { c.settings = { ...c.settings, verificationEngineEnabled: false } }, 'Auto-approval off'],
 ['employer resubmission', c => { c.docKey = 'employerNsrpForm'; c.document.version = 2 }, 'Resubmission'],
 ['uploaded NSRP', c => { c.docKey = 'nsrpForm'; c.document.sourceType = 'uploaded' }, 'Uploaded file'],
 ['unverified email', c => { c.account.emailVerified = false }, 'Email unverified'],
 ['hold', c => { c.account.holdAutoApproval = true }, 'Hold'],
 ['suspension', c => { c.account.applyingSuspendedAt = new Date() }, 'Hold'],
 ['restriction', c => { c.account.verificationStatus = 'restricted' }, 'Hold'],
 ['flag', c => { c.findings = [{ severity: 'warning', status: 'open' }] }, 'Flagged'],
 ['duplicate', c => { c.findings = [{ ruleId: 'duplicate_tin', severity: 'info', status: 'dismissed' }] }, 'Flagged'],
 ['explanation', c => { c.pendingExplanation = true }, 'Explanation'],
 ['quality', c => { c.document.quality.warnings = ['blur'] }, 'Quality warning'],
 ['no read', c => { c.document.quality = undefined }, 'Could not be read'],
 ['no independent evidence', c => { c.comparisons[0].evidence = 'self-declared' }, 'Not independent'],
 ['sex is not evidence', c => { c.comparisons[0].fieldGroup = 'sex' }, 'Not independent'],
 ['government', c => { c.docKey = 'employerNsrpForm'; c.document.sourceType = 'generated'; c.account.employerType = 'Government' }, 'Always manual'],
])('keeps %s pending with the right reason', (_, mutate, reason) => { const c = context(); mutate(c); expect(decisionReason(c)).toBe(reason) })
it('allows a replacement identity document to pass the same verification checks', () => {
 const c = context(); c.document.version = 2
 expect(decisionReason(c)).toBe('')
 c.findings = [{ severity: 'warning', status: 'open' }]
 expect(decisionReason(c)).toBe('Flagged')
})
it('permits the explicit none evidence mode and never consults protected attributes', () => {
 const c = context(); c.settings = { ...c.settings, minimumEvidence: 'none' }; c.comparisons = []; c.account = { ...c.account, age: 99, sex: 'Female', religion: 'Other', disability: 'Other', civilStatus: 'Married', address: 'Different' }
 expect(decisionReason(c)).toBe('')
 c.findings = [{ ruleId: 'education_age', severity: 'warning', approvalBlocking: false }]; expect(decisionReason(c)).toBe('')
})
it('verifies EdDSA signatures, rejects tampering/wrong keys, and treats missing keys as unavailable', async () => {
 const { publicKey, privateKey } = generateKeyPairSync('ed25519'), wrong = generateKeyPairSync('ed25519')
 const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: 'demo' })).toString('base64url')
 const payload = Buffer.from(JSON.stringify({ firstName: 'Juan', surname: 'Cruz', dob: '1990-01-01', cardNumber: 'DO-NOT-STORE' })).toString('base64url')
 const signed = header + '.' + payload, signature = sign(null, Buffer.from(signed), privateKey).toString('base64url'), qrPayload = signed + '.' + signature
 const provider = new PhilSysQrSignatureProvider({ keys: { demo: { pem: publicKey.export({ type: 'spki', format: 'pem' }) } } })
 const report = await provider.verify({ qrPayload }, { nsrp: { firstName: 'Juan', surname: 'Cruz', dob: '1990-01-01' } })
 expect(report).toMatchObject({ result: 'verified', assurance: 'high', verifiedQr: true })
 expect(JSON.stringify(report)).not.toMatch(/JUAN|Juan|1990|DO-NOT-STORE|cardNumber|payload|signature/)
 expect((await provider.verify({ qrPayload: header + '.' + Buffer.from('{}').toString('base64url') + '.' + signature })).result).toBe('failed')
 expect((await new PhilSysQrSignatureProvider({ keys: { demo: { pem: wrong.publicKey.export({ type: 'spki', format: 'pem' }) } } }).verify({ qrPayload })).result).toBe('failed')
 expect((await new PhilSysQrSignatureProvider({ keys: null }).verify({ qrPayload })).result).toBe('unavailable')
 expect((await new ThirdPartyEkycProvider().verify()).result).toBe('unavailable')
 expect((await new MockEkycProvider({ enabled: true }).verify()).result).toBe('unavailable')
 expect((await new MockEkycProvider({ enabled: true, sandbox: true }).verify()).result).toBe('verified')
})
