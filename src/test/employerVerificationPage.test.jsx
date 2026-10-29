import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EmployerVerificationPage from "../components/EmployerVerificationPage"

vi.mock("../components/NsrpSignatureInput", () => ({ default: () => null }))

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
})

describe("employer verification page", () => {
  it("replaces employer features with the waitlist and submitted document", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        verificationStatus: "under_review",
        emailVerified: true,
        email: "employer@example.com",
        companyName: "Example Works",
        submittedAt: "2025-01-02T00:00:00.000Z",
        document: { version: 1, originalName: "form-2.pdf", status: "pending", sourceType: "uploaded" },
        versions: [],
      }),
    })

    render(<EmployerVerificationPage token="test-token" />)

    expect(await screen.findByRole("heading", { name: "You're on the waitlist" })).toBeTruthy()
    expect(screen.getByText("Example Works")).toBeTruthy()
    expect(screen.getByText("Uploaded by you")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Fill out online instead" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Replace file" })).toBeNull()
    expect(screen.queryByText("Manage Job Postings")).toBeNull()
  })

  it("opens resubmission actions in a modal only after an admin requests a new document", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        verificationStatus: "needs_resubmission",
        verificationReason: "Document unreadable",
        companyName: "Example Works",
        document: { version: 1, originalName: "form-2.pdf", status: "rejected", sourceType: "generated" },
        versions: [],
      }),
    })

    render(<EmployerVerificationPage token="test-token" />)

    expect(await screen.findByText("Admin reason: Document unreadable")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Update NSRP Form 2" }))
    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Update NSRP Form 2 online" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "NSRP Form 2" })).toBeTruthy()
    expect(screen.getByText(/form-2\.pdf/)).toBeTruthy()

    const tin = screen.getByLabelText("Tax identification number (TIN)")
    expect(tin).toHaveAttribute("placeholder", "4500")
    fireEvent.change(tin, { target: { value: "4500" } })
    expect(screen.getByText("Enter a TIN with 9 or 12 digits.")).toBeInTheDocument()
    expect(tin).toHaveAttribute("aria-invalid", "true")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens file replacement in the same modal shell", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        verificationStatus: "needs_resubmission",
        companyName: "Example Works",
        document: { version: 1, originalName: "form-2.pdf", status: "rejected", sourceType: "uploaded" },
        versions: [],
      }),
    })

    render(<EmployerVerificationPage token="test-token" />)
    await screen.findByRole("heading", { name: "NSRP Form 2 needs resubmission" })
    fireEvent.click(screen.getByRole("button", { name: "Replace file" }))

    expect(await screen.findByRole("heading", { name: "Replace NSRP Form 2 file" })).toBeTruthy()
    expect(screen.getByTestId("overlay-modal-body").className).toContain("overflow-y-auto")
    expect(screen.getByTestId("overlay-modal-footer")).toBeInTheDocument()
    expect(screen.getByLabelText("NSRP Form 2 PDF")).toBeInTheDocument()
  })
})
