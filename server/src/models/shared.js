import mongoose from 'mongoose';

export const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 600 },
    alt: { type: String, trim: true, maxlength: 160, default: '' },
    credit: { type: String, trim: true, maxlength: 160 },
    // Cloudinary public id (used to delete the asset); empty for external/local images.
    publicId: { type: String, trim: true, maxlength: 200 },
  },
  { _id: true }
);

export const objectId = mongoose.Schema.Types.ObjectId;
