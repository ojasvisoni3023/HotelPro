import mongoose from 'mongoose';

/** Records processed webhook deliveries so retries/duplicates are ignored (idempotency). */
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: String,
    receivedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', webhookEventSchema);
