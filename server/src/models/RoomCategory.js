import mongoose from 'mongoose';
import { imageSchema, objectId } from './shared.js';

/**
 * A room type (e.g. "Deluxe King") offered by a hotel. Guests book a room type;
 * the server assigns a free physical Room of that type. Pricing lives here because
 * physical rooms of the same type are sold at the same rate.
 */
const seasonalRateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }, // inclusive last night
    price: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const roomCategorySchema = new mongoose.Schema(
  {
    hotel: { type: objectId, ref: 'Hotel', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    maxGuests: { type: Number, required: true, min: 1, max: 12 },
    bedType: { type: String, trim: true, maxlength: 40 },
    sizeSqm: { type: Number, min: 0, max: 1000 },
    amenities: [{ type: String, trim: true, maxlength: 40 }],
    images: { type: [imageSchema], default: [] },
    basePrice: { type: Number, required: true, min: 0 },
    seasonalRates: { type: [seasonalRateSchema], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

roomCategorySchema.index({ hotel: 1, name: 1 }, { unique: true });
roomCategorySchema.index({ status: 1, basePrice: 1 });

export default mongoose.models.RoomCategory || mongoose.model('RoomCategory', roomCategorySchema);
