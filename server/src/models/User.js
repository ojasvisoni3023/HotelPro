import mongoose from 'mongoose';

export const ROLES = ['guest', 'staff', 'manager', 'admin'];
export const USER_STATUSES = ['active', 'suspended'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'guest', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: Date,
    phone: { type: String, trim: true, maxlength: 20 },
    address: {
      line1: { type: String, trim: true, maxlength: 120 },
      city: { type: String, trim: true, maxlength: 60 },
      state: { type: String, trim: true, maxlength: 60 },
      country: { type: String, trim: true, maxlength: 60 },
      postalCode: { type: String, trim: true, maxlength: 12 },
    },
    // Incremented on password reset / role change / suspension to invalidate existing sessions.
    tokenVersion: { type: Number, default: 0 },
    verifyTokenHash: { type: String, select: false },
    verifyTokenExpires: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.verifyTokenHash;
        delete ret.verifyTokenExpires;
        delete ret.resetTokenHash;
        delete ret.resetTokenExpires;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ createdAt: -1 });

export default mongoose.models.User || mongoose.model('User', userSchema);
