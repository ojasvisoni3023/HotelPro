import mongoose from 'mongoose';
import { objectId } from './shared.js';

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: objectId, ref: 'Booking', required: true, unique: true },
    hotel: { type: objectId, ref: 'Hotel', required: true },
    category: { type: objectId, ref: 'RoomCategory' },
    guest: { type: objectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
    moderatedBy: { type: objectId, ref: 'User' },
    moderationNote: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

reviewSchema.index({ hotel: 1, status: 1, createdAt: -1 });
reviewSchema.index({ guest: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model('Review', reviewSchema);
