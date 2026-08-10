import mongoose from 'mongoose'

const { Schema } = mongoose

// Base user schema stored in the `users` collection.
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'Applicant' },
    profile: {
      name: String,
      location: String,
      skills: String,
      traits: String,
      summary: String,
    },
  },
  { discriminatorKey: 'role', collection: 'users', timestamps: true },
)

const User = mongoose.models.User || mongoose.model('User', userSchema)

// Discriminators for role-specific models. Keep schemas minimal; you can
// extend them later with role-specific fields.
const Admin = mongoose.models.Admin || User.discriminator('Admin', new Schema({}, { _id: false }))
const Employer =
  mongoose.models.Employer || User.discriminator('Employer', new Schema({ companyName: String, contactName: String }, { _id: false }))
const Applicant = mongoose.models.Applicant || User.discriminator('Applicant', new Schema({}, { _id: false }))

export { User, Admin, Employer, Applicant }
