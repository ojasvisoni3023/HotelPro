import mongoose from 'mongoose';
import { imageSchema } from './shared.js';

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline: { type: String, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    address: {
      line1: { type: String, required: true, trim: true, maxlength: 160 },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      state: { type: String, trim: true, maxlength: 80 },
      country: { type: String, required: true, trim: true, maxlength: 80, default: 'India' },
      postalCode: { type: String, trim: true, maxlength: 12 },
    },
    location: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    contact: {
      phone: { type: String, trim: true, maxlength: 20 },
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      website: { type: String, trim: true, maxlength: 200 },
    },
    starRating: { type: Number, min: 1, max: 5, default: 4 },
    amenities: [{ type: String, trim: true, maxlength: 40 }],
    images: { type: [imageSchema], default: [] },
    checkInTime: { type: String, default: '14:00', match: /^\d{2}:\d{2}$/ },
    checkOutTime: { type: String, default: '11:00', match: /^\d{2}:\d{2}$/ },
    policies: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

hotelSchema.index({ status: 1, 'address.city': 1 });

// Managers and staff are linked through StaffAssignment (single source of truth).
hotelSchema.virtual('assignments', {
  ref: 'StaffAssignment',
  localField: '_id',
  foreignField: 'hotel',
});

export default mongoose.models.Hotel || mongoose.model('Hotel', hotelSchema);
