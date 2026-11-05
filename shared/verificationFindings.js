// A household or business may share a contact number. Legacy phone-duplicate
// findings remain in the audit history but no longer block verification.
export const isSharedPhoneFinding = finding => ['duplicate_mobile', 'duplicate_phone'].includes(finding?.ruleId || finding?.code)
