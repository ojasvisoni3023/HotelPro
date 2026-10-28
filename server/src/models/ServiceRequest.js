import mongoose from 'mongoose';
import { objectId } from './shared.js';

export const SERVICE_REQUEST_TYPES = ['housekeeping', 'maintenance', 'room_service', 'amenities', 'other'];
export const SERVICE_REQUEST_STATUSES = ['open', 'in_progress', 'resolved', 'cancelled'];

const serviceRequestSchema = new mongoose.Schema(
  {
    hotel: { type: objectId, ref: 'Hotel', required: true },
    booking: { type: objectId, ref: 'Booking', required: true },
    guest: { type: objectId, ref: 'User', required: true },
    room: { type: objectId, ref: 'Room' },
    type: { type: String, enum: SERVICE_REQUEST_TYPES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: SERVICE_REQUEST_STATUSES, default: 'open' },
    assignedTo: { type: objectId, ref: 'User' },
    staffNote: { type: String, trim: true, maxlength: 500 },
    resolvedAt: Date,
  },
  { timestamps: true }
);

serviceRequestSchema.index({ hotel: 1, status: 1, createdAt: -1 });
serviceRequestSchema.index({ guest: 1, createdAt: -1 });

export default mongoose.models.ServiceRequest || mongoose.model('ServiceRequest', serviceRequestSchema);
