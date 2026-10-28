import mongoose from 'mongoose';
import { objectId } from './shared.js';

export const ROOM_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance', 'out_of_service'];
/** Rooms in these states cannot be assigned to new reservations. */
export const UNSELLABLE_ROOM_STATUSES = ['maintenance', 'out_of_service'];

const roomSchema = new mongoose.Schema(
  {
    hotel: { type: objectId, ref: 'Hotel', required: true },
    category: { type: objectId, ref: 'RoomCategory', required: true, index: true },
    roomNumber: { type: String, required: true, trim: true, maxlength: 10 },
    floor: { type: Number, min: -5, max: 200 },
    status: { type: String, enum: ROOM_STATUSES, default: 'available' },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

roomSchema.index({ hotel: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ hotel: 1, status: 1 });

export default mongoose.models.Room || mongoose.model('Room', roomSchema);
