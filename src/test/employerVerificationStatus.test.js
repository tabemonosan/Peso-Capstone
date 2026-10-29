import { describe, expect, it } from "vitest"
import { deriveEmployerVerificationStatus } from "../../shared/employerVerification.js"

describe("employer verification status", () => {
  it("fails closed when employer status and request are both missing", () => {
    expect(deriveEmployerVerificationStatus({
      decision: undefined,
      documentStatus: undefined,
      fallbackStatus: undefined,
      hasRequest: false,
    })).toBe("under_review")
  })
})
