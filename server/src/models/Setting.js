import mongoose from 'mongoose';

/** Singleton document (key = "platform") holding admin-configurable business rules. */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'platform' },
    taxRatePercent: { type: Number, min: 0, max: 40, default: 12 },
    freeCancellationHours: { type: Number, min: 0, max: 720, default: 48 },
    lateCancellationRefundPercent: { type: Number, min: 0, max: 100, default: 50 },
    maxStayNights: { type: Number, min: 1, max: 90, default: 30 },
    bookingWindowDays: { type: Number, min: 1, max: 730, default: 365 },
    supportEmail: { type: String, trim: true, default: 'support@hotelpro.example' },
    supportPhone: { type: String, trim: true, default: '+91 00000 00000' },
    announcement: { type: String, trim: true, maxlength: 200, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.models.Setting || mongoose.model('Setting', settingSchema);
