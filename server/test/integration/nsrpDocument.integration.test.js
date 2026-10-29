// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import { startTestDb, stopTestDb, clearDb } from "./helpers.js"

const { app } = await import("../../index.js")
const { Employer } = await import("../../models/collections.js")
const EmployerRequest = mongoose.model("EmployerRequest")

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"
const tokenFor = (role, email = `${role.toLowerCase()}@example.com`) => jwt.sign({ email, role }, JWT_SECRET)
const bearer = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` })

const createRequest = (requirementsFile) => EmployerRequest.create({
  email: "nsrp-employer@example.com",
  passwordHash: "unused",
  companyName: "Example Works, Inc.",
  contactName: "Jamie Cruz",
  status: "under_review",
  requirementsFile,
})

const pdfFile = (data) => ({
  originalName: "3f2b7c1e-uuid.pdf",
  mimetype: "application/pdf",
  size: data.length,
  data,
  version: 1,
  sourceType: "uploaded",
})

beforeAll(async () => {
  await startTestDb()
})

afterAll(async () => {
  await stopTestDb()
})

beforeEach(async () => {
  await clearDb()
})

describe("admin NSRP document endpoints", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")

  it("requires authentication and the Admin role", async () => {
    const doc = await createRequest(pdfFile(pdf))
    await Employer.create({ email: "employer@example.com", passwordHash: "unused", emailVerified: true,     verificationStatus: "approved" })
        for (const suffix of ["view", "download"]) {
          const url = `/api/employers/${doc._id}/nsrp/${suffix}`
      expect((await request(app).get(url)).status).toBe(401)
      expect((await request(app).get(url).set(bearer("Employer"))).status).toBe(403)
    }
  })

  it("serves a real PDF inline and as an attachment with an NSRP filename", async () => {
    const doc = await createRequest(pdfFile(pdf))

    const view = await request(app).get(`/api/employers/${doc._id}/nsrp/view`).set(bearer("Admin")).buffer(true)
    expect(view.status).toBe(200)
    expect(view.headers["content-type"]).toContain("application/pdf")
    expect(view.headers["content-disposition"]).toBe('inline; filename="NSRP-Example_Works_Inc.pdf"')
    expect(Buffer.from(view.body).subarray(0, 5).toString()).toBe("%PDF-")
    expect(Buffer.from(view.body).length).toBe(pdf.length)

    const download = await request(app).get(`/api/employers/${doc._id}/nsrp/download`).set(bearer("Admin")).buffer(true)
    expect(download.status).toBe(200)
    expect(download.headers["content-disposition"]).toBe('attachment; filename="NSRP-Example_Works_Inc.pdf"')
  })

  it("keeps the legacy employer-requirements paths working", async () => {
    const doc = await createRequest(pdfFile(pdf))
    const legacy = await request(app).get(`/api/employer-requirements/${doc._id}/view`).set(bearer("Admin"))
    expect(legacy.status).toBe(200)
    expect(legacy.headers["content-type"]).toContain("application/pdf")
  })

  it("returns JSON 404 when the file is missing", async () => {
    const doc = await createRequest(undefined)
    const missing = await request(app).get(`/api/employers/${doc._id}/nsrp/view`).set(bearer("Admin"))
    expect(missing.status).toBe(404)
    expect(missing.headers["content-type"]).toContain("application/json")

    const unknown = await request(app).get(`/api/employers/${new mongoose.Types.ObjectId()}/nsrp/view`).set(bearer("Admin"))
    expect(unknown.status).toBe(404)
  })

  it("returns JSON 422 instead of a broken PDF when the stored file is corrupt", async () => {
    const doc = await createRequest(pdfFile(Buffer.from("not a pdf at all")))
    const response = await request(app).get(`/api/employers/${doc._id}/nsrp/view`).set(bearer("Admin"))
    expect(response.status).toBe(422)
    expect(response.body.error).toBe("This document is unavailable or corrupted")
  })
})
