import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EmployerSignupWizard from "../components/EmployerSignupWizard"

const mockFetch = vi.fn()

beforeEach(() => {
  localStorage.clear()
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  mockFetch.mockImplementation(async (url) => {
    if (url.endsWith("/api/signup/email-code")) return { ok: true, json: async () => ({ ok: true }) }
    if (url.endsWith("/api/signup/email-code/verify")) return { ok: true, json: async () => ({ proofToken: "private-email-proof" }) }
    return { ok: false, json: async () => ({ error: "Unexpected request" }) }
  })
})

describe("employer sign-up wizard", () => {
  it("supports next-tab navigation and saves a draft without account secrets", async () => {
    render(<EmployerSignupWizard locations={{ "Legazpi City": ["Barangay 1"] }} />)
    fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: "employer@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /Send 6-digit code/i }))
    await screen.findByLabelText(/^Code digit 1$/i)
    fireEvent.change(screen.getByLabelText(/^Code digit 1$/i), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: /^Verify$/i }))
    await screen.findByText(/Email verified/i)

    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: "Password123!" } })
    fireEvent.change(screen.getByLabelText(/^Confirm password/i), { target: { value: "Password123!" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /collection and processing/i }))
    fireEvent.click(screen.getByRole("button", { name: /^Next$/i }))
    await screen.findByRole("radiogroup", { name: /NSRP Form 2 options/i })

    fireEvent.click(screen.getByRole("radio", { name: /Fill it out online/i }))
    fireEvent.click(screen.getByRole("button", { name: /3\. Establishment details/i }))
    await screen.findByRole("heading", { name: "Establishment details" })

    const draft = localStorage.getItem("peso-employer-signup-draft")
    expect(draft).toContain("employer@example.com")
    expect(draft).not.toContain("Password123!")
    expect(draft).not.toContain("private-email-proof")
    expect(draft).not.toContain("signatureDataUrl")
    expect(draft).not.toContain("registrationFile")
    expect(draft).not.toContain("123456")
  })
})
