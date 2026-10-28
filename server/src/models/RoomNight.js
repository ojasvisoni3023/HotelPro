import mongoose from 'mongoose';
import { objectId } from './shared.js';

/**
 * One document per (physical room, night) that is held or sold.
 * The unique index on { room, date } is what makes double-booking impossible:
 * two concurrent reservations for the same room-night cannot both be inserted,
 * regardless of whether the MongoDB deployment supports transactions.
 *
 * expiresAt is set while the booking is awaiting payment (a "hold") and cleared
 * once the booking is confirmed. Expired holds are released by the hold sweeper
 * and reclaimed lazily when another booking needs the same night.
 */
const roomNightSchema = new mongoose.Schema(
  {
    room: { type: objectId, ref: 'Room', required: true },
    date: { type: Date, required: true },
    booking: { type: objectId, ref: 'Booking', required: true, index: true },
    hotel: { type: objectId, ref: 'Hotel', required: true },
    category: { type: objectId, ref: 'RoomCategory', required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: false, versionKey: false }
);

roomNightSchema.index({ room: 1, date: 1 }, { unique: true });
roomNightSchema.index({ category: 1, date: 1 });
roomNightSchema.index({ hotel: 1, date: 1 });

export default mongoose.models.RoomNight || mongoose.model('RoomNight', roomNightSchema);
