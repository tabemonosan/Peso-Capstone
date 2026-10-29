import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import App from "../App"

const mockFetch = vi.fn()
const employer = {
  id: "employer-1",
  email: "waitlist@example.com",
  role: "Employer",
  emailVerified: true,
  verificationStatus: "under_review",
  registration: { complete: true },
}
const verification = {
  email: employer.email,
  emailVerified: true,
  verificationStatus: "under_review",
  companyName: "Example Works",
  submittedAt: "2025-01-02T00:00:00.000Z",
  document: { version: 1, originalName: "form-2.pdf", status: "pending", sourceType: "uploaded" },
  versions: [],
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal("fetch", mockFetch)
  localStorage.clear()
  mockFetch.mockImplementation((url) => {
    if (url === "http://localhost:4000/api/login") {
      return Promise.resolve({ ok: true, json: async () => ({ token: "employer-token", user: employer }) })
    }
    if (url === "http://localhost:4000/api/employer/verification") {
      return Promise.resolve({ ok: true, json: async () => verification })
    }
    if (url === "http://localhost:4000/api/notifications") {
      return Promise.resolve({ ok: true, json: async () => ({ items: [], unreadCount: 0 }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("employer waitlist navigation", () => {
  it("replaces the employer dashboard and leaves only Account verification in the sidebar", async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: employer.email } })
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: "Password123!" } })
    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }).closest("form"))

    expect(await screen.findByRole("heading", { name: "You're on the waitlist" })).toBeTruthy()
    const navigation = screen.getByRole("navigation", { name: "Employer navigation" })
    await waitFor(() => {
      expect(navigation.querySelectorAll("button")).toHaveLength(1)
    })
    expect(screen.getByRole("button", { name: "Account verification" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Employer Dashboard" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Job Postings" })).toBeNull()
  })
})
