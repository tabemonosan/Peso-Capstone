import { createPublicKey, verify } from 'node:crypto'
import { crossChecks } from '../../shared/crossChecks.js'
import { DECISION_RULES_VERSION } from '../../shared/verificationDecision.js'
import { decodePhilSysEnvelope } from './philsysQrFormat.js'
const result = (provider, value, assurance = 'low', findings = [], extra = {}) => ({ provider, result: value, assurance, findings, rulesVersion: DECISION_RULES_VERSION, ...extra })
export class LocalChecksProvider {
  async verify(document) {
    if (document.quality?.passed === false) return result('LocalChecksProvider', 'failed')
    return result('LocalChecksProvider', document.quality?.passed ? 'verified' : 'inconclusive', 'low', document.findings || [])
  }
}
export class PhilSysQrSignatureProvider {
  constructor({ keys = process.env.PHILSYS_PUBLIC_KEYS, enabled = true } = {}) { this.keys = keys; this.enabled = enabled }
  async verify(document, context = {}) {
    const provider = 'PhilSysQrSignatureProvider'
    if (!this.enabled || !this.keys) return result(provider, 'unavailable')
    const envelope = decodePhilSysEnvelope(document.qrPayload)
    if (!envelope) return result(provider, 'unavailable')
    try {
      const keys = typeof this.keys === 'string' ? JSON.parse(this.keys) : this.keys
      const key = Array.isArray(keys) ? keys.find(k => k.kid === envelope.header.kid) : keys[envelope.header.kid]
      if (!key) return result(provider, 'failed', 'low', [{ ruleId: 'philsys_signature_invalid', severity: 'critical', fieldGroup: 'document', evidence: 'independent', status: 'open' }])
      const publicKey = key.pem ? createPublicKey(key.pem) : createPublicKey({ key: key.jwk || key, format: 'jwk' })
      if (!verify(null, envelope.signed, publicKey, envelope.signature)) return result(provider, 'failed', 'low', [{ ruleId: 'philsys_signature_invalid', severity: 'critical', fieldGroup: 'document', evidence: 'independent', status: 'open' }])
      const payload = envelope.payload()
      // Whitelist only fields needed for transient comparisons. Never expose the payload.
      const values = { firstName: payload.firstName, surname: payload.surname, middleName: payload.middleName, dob: payload.dob || payload.birthDate }
      if (!values.firstName || !values.surname) return result(provider, 'inconclusive')
      const report = crossChecks({ nsrp: context.nsrp, ids: [{ values, evidence: 'independent' }] })
      return result(provider, 'verified', 'high', report.findings, { verifiedQr: true, comparisons: report.comparisons })
    } catch { return result(provider, 'unavailable') }
  }
}
export class ThirdPartyEkycProvider { async verify() { return result('ThirdPartyEkycProvider', 'unavailable') } }
export class MockEkycProvider {
  constructor({ enabled = false, sandbox = false } = {}) { this.enabled = enabled; this.sandbox = sandbox }
  async verify() { return result('MockEkycProvider', this.enabled && this.sandbox ? 'verified' : 'unavailable', 'low') }
}
