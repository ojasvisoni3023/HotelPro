import mongoose from 'mongoose';
import { objectId } from './shared.js';

export const HOUSEKEEPING_TYPES = ['checkout_clean', 'daily_service', 'deep_clean', 'inspection', 'maintenance'];
export const HOUSEKEEPING_STATUSES = ['pending', 'in_progress', 'done'];

const housekeepingTaskSchema = new mongoose.Schema(
  {
    hotel: { type: objectId, ref: 'Hotel', required: true },
    room: { type: objectId, ref: 'Room', required: true },
    booking: { type: objectId, ref: 'Booking' },
    type: { type: String, enum: HOUSEKEEPING_TYPES, required: true },
    status: { type: String, enum: HOUSEKEEPING_STATUSES, default: 'pending' },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    assignedTo: { type: objectId, ref: 'User' },
    notes: { type: String, trim: true, maxlength: 500 },
    dueDate: Date,
    completedAt: Date,
    createdBy: { type: objectId, ref: 'User' },
  },
  { timestamps: true }
);

housekeepingTaskSchema.index({ hotel: 1, status: 1, createdAt: -1 });
housekeepingTaskSchema.index({ room: 1, status: 1 });

export default mongoose.models.HousekeepingTask || mongoose.model('HousekeepingTask', housekeepingTaskSchema);
