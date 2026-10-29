// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import { startTestDb, stopTestDb, clearDb } from "./helpers.js"

const { app } = await import("../../index.js")
const { Admin, Applicant, Employer, Notification, Referral } = await import("../../models/collections.js")
const EmployerRequest = mongoose.model("EmployerRequest")
const JobPosting = mongoose.model("JobPosting")

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret"
const employerToken = (email) => jwt.sign({ email, role: "Employer" }, JWT_SECRET)
const adminToken = () => jwt.sign({ email: "admin@example.com", role: "Admin" }, JWT_SECRET)

beforeAll(async () => {
  await startTestDb()
})

afterAll(async () => {
  await stopTestDb()
})

beforeEach(async () => {
  await clearDb()
})

describe("employer verification access control", () => {
  it("restricts pending employers, then unlocks the same session after approval", async () => {
    const email = "waitlisted-employer@example.com"
    await Admin.create({ email: "admin@example.com", passwordHash: "unused" })
    const employer = await Employer.create({
      email,
      passwordHash: "unused",
      emailVerified: true,
      verificationStatus: "under_review",
      companyName: "Example Works",
      contactName: "Jamie Cruz",
      phone: "09171234567",
      profile: { location: "Legazpi City" },
    })
    const pdf = Buffer.from("%PDF-1.4 test document")
    const employerRequest = await EmployerRequest.create({
      email,
      passwordHash: "unused",
      companyName: employer.companyName,
      contactName: employer.contactName,
      phone: employer.phone,
      location: "Legazpi City",
      status: "under_review",
      requirementsSubmittedAt: new Date(),
      requirementsFile: {
        originalName: "form-2.pdf",
        filename: "form-2.pdf",
        mimetype: "application/pdf",
        size: pdf.length,
        data: pdf,
        version: 1,
        sourceType: "uploaded",
        status: "pending",
      },
      requirementsVersions: [{
        version: 1,
        originalName: "form-2.pdf",
        filename: "form-2.pdf",
        mimetype: "application/pdf",
        size: pdf.length,
        sourceType: "uploaded",
        status: "pending",
        uploadedAt: new Date(),
      }],
    })
    const token = employerToken(email)
    const auth = { Authorization: `Bearer ${token}` }

    for (const response of [
      await request(app).post("/api/jobs").set(auth).send({}),
      await request(app).get("/api/jobs").set(auth),
      await request(app).put(`/api/referrals/${new mongoose.Types.ObjectId()}/respond`).set(auth).send({ status: "accepted" }),
    ]) {
      expect(response.status).toBe(403)
      expect(response.body).toMatchObject({ code: "EMPLOYER_NOT_VERIFIED", status: "under_review" })
    }

    const notifications = await request(app).get("/api/notifications").set(auth)
    expect(notifications.status).toBe(200)
    const ownDocument = await request(app).get("/api/employer-requirements/current/view").set(auth)
    expect(ownDocument.status).toBe(200)
    expect(ownDocument.headers["content-type"]).toContain("application/pdf")

    const pendingReplacement = await request(app)
      .post("/api/employer-requirements")
      .set(auth)
      .attach("requirements", Buffer.from("%PDF-1.4 premature replacement"), {
        filename: "premature-replacement.pdf",
        contentType: "application/pdf",
      })
    expect(pendingReplacement.status).toBe(409)
    expect(pendingReplacement.body.code).toBe("EMPLOYER_RESUBMISSION_NOT_REQUESTED")

    const otherEmployer = await Employer.create({
      email: "other-employer@example.com",
      passwordHash: "unused",
      emailVerified: true,
      verificationStatus: "under_review",
    })
    const otherRequest = await request(app)
      .get("/api/employer-requirements/current/view")
      .set({ Authorization: `Bearer ${employerToken(otherEmployer.email)}` })
    expect(otherRequest.status).toBe(404)

    const decline = await request(app)
      .put(`/api/employer-requests/${employerRequest._id}/status`)
      .set({ Authorization: `Bearer ${adminToken()}` })
      .send({ status: "needs_resubmission", reason: "Document unreadable" })
    expect(decline.status).toBe(200)
    const invalidTinResubmission = await request(app)
      .post("/api/employer-requirements")
      .set(auth)
      .field("registrationDetails", JSON.stringify({
        acronym: "EW",
        taxIdentificationNumber: "4500",
        employerType: "Private",
        workforceSize: "Small (10-99)",
        lineOfBusiness: "Retail",
        address: "12 Main Street",
        barangay: "San Roque",
        cityMunicipality: "Legazpi City",
        province: "Albay",
        contactTitle: "Ms.",
        otherContactTitle: "",
        contactPosition: "HR Manager",
        telephone: "",
        fax: "",
      }))
      .attach("requirements", Buffer.from("%PDF-1.4 invalid TIN"), {
        filename: "invalid-tin.pdf",
        contentType: "application/pdf",
      })
    expect(invalidTinResubmission.status).toBe(422)
    expect(invalidTinResubmission.status).not.toBe(500)
    expect(invalidTinResubmission.body.fieldErrors).toMatchObject({
      taxIdentificationNumber: "Enter a TIN with 9 or 12 digits.",
    })

    const resubmission = await request(app)
      .post("/api/employer-requirements")
      .set(auth)
      .field("companyName", employer.companyName)
      .field("contactName", employer.contactName)
      .field("phone", employer.phone)
      .field("location", "Legazpi City")
      .attach("requirements", Buffer.from("%PDF-1.4 replacement"), {
        filename: "replacement.pdf",
        contentType: "application/pdf",
      })
    expect(resubmission.status).toBe(200)
    expect(resubmission.body).toMatchObject({ status: "under_review", version: 2 })
    expect(await Notification.countDocuments({ type: "employer_resubmitted" })).toBe(1)

    const currentVerification = await request(app).get("/api/employer/verification").set(auth)
    expect(currentVerification.body).toMatchObject({
      verificationStatus: "under_review",
      document: { version: 2, status: "pending" },
    })

    const approval = await request(app)
      .put(`/api/employer-requests/${employerRequest._id}/status`)
      .set({ Authorization: `Bearer ${adminToken()}` })
      .send({ status: "approved" })
    expect(approval.status).toBe(200)

    const job = await request(app).post("/api/jobs").set(auth).send({
      title: "Software Engineer",
      company: "Example Works",
      description: "Build and maintain software.",
      skills: ["JavaScript"],
    })
    expect(job.status).toBe(200)
    expect((await request(app).get("/api/jobs").set(auth)).status).toBe(200)

    const lockedReplacement = await request(app)
      .post("/api/employer-requirements")
      .set(auth)
      .attach("requirements", Buffer.from("%PDF-1.4 replacement"), {
        filename: "another-replacement.pdf",
        contentType: "application/pdf",
      })
    expect(lockedReplacement.status).toBe(409)

    const applicant = await Applicant.create({
      email: "applicant@example.com",
      passwordHash: "unused",
      profile: { name: "Taylor Applicant" },
    })
    const storedJob = await JobPosting.findOne({ createdBy: email })
    const referral = await Referral.create({
      jobId: storedJob._id,
      applicantId: applicant._id,
      employerId: employer._id,
      referredBy: new mongoose.Types.ObjectId(),
    })
    const response = await request(app)
      .put(`/api/referrals/${referral._id}/respond`)
      .set(auth)
      .send({ status: "accepted" })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe("accepted")
  }, 60000)

  it("treats a legacy employer with no status or request as under review", async () => {
    const email = "missing-status@example.com"
    await mongoose.connection.db.collection("employers").insertOne({
      email,
      passwordHash: "unused",
      emailVerified: true,
      companyName: "Legacy Works",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const auth = { Authorization: `Bearer ${employerToken(email)}` }

    const verification = await request(app).get("/api/employer/verification").set(auth)
    expect(verification.status).toBe(200)
    expect(verification.body.verificationStatus).toBe("under_review")

    const job = await request(app).post("/api/jobs").set(auth).send({
      title: "Clerk",
      company: "Legacy Works",
      description: "A legacy employer must not bypass review.",
      skills: ["Administration"],
    })
    expect(job.status).toBe(403)
    expect(job.body).toMatchObject({ code: "EMPLOYER_NOT_VERIFIED", status: "under_review" })
  })
})
