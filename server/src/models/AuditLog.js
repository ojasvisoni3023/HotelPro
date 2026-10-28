import mongoose from 'mongoose';
import { objectId } from './shared.js';

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: objectId, ref: 'User' },
    actorEmail: String,
    actorRole: String,
    category: { type: String, enum: ['security', 'admin', 'activity'], required: true },
    action: { type: String, required: true, maxlength: 80 },
    entityType: String,
    entityId: String,
    details: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
