import mongoose from 'mongoose';
import { objectId } from './shared.js';

/**
 * Links managers and staff to the hotels they may operate.
 * Authorization for hotel-scoped endpoints is derived from active assignments.
 */
const staffAssignmentSchema = new mongoose.Schema(
  {
    user: { type: objectId, ref: 'User', required: true },
    hotel: { type: objectId, ref: 'Hotel', required: true },
    role: { type: String, enum: ['manager', 'staff'], required: true },
    position: { type: String, trim: true, maxlength: 60, default: '' },
    active: { type: Boolean, default: true },
    assignedBy: { type: objectId, ref: 'User' },
  },
  { timestamps: true }
);

staffAssignmentSchema.index({ user: 1, hotel: 1 }, { unique: true });
staffAssignmentSchema.index({ hotel: 1, role: 1, active: 1 });

export default mongoose.models.StaffAssignment || mongoose.model('StaffAssignment', staffAssignmentSchema);
