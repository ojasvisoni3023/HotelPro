import mongoose from 'mongoose';
import { objectId } from './shared.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: objectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 40 },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 1000 },
    link: { type: String, maxlength: 300 },
    read: { type: Boolean, default: false },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
