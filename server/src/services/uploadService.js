import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import config from '../config/index.js';
import ApiError from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

if (config.cloudinary.url) {
  cloudinary.config({ cloudinary_url: config.cloudinary.url, secure: true });
}

export function storageMode() {
  if (config.cloudinary.url) return 'cloudinary';
  if (!config.isProd) return 'local';
  return 'none';
}

/** Multer keeps the file in memory; it is validated before being stored anywhere. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED[file.mimetype]) return cb(ApiError.badRequest('Only JPEG, PNG or WebP images are allowed', { code: 'UPLOAD_TYPE' }));
    cb(null, true);
  },
}).single('image');

/** Checks the real file signature, not just the client-declared MIME type. */
function sniff(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function storeImage(file) {
  if (!file) throw ApiError.badRequest('No image provided', { code: 'UPLOAD_MISSING' });
  const real = sniff(file.buffer);
  if (!real || !ALLOWED[real]) throw ApiError.badRequest('The file is not a valid JPEG, PNG or WebP image', { code: 'UPLOAD_TYPE' });

  const mode = storageMode();
  if (mode === 'cloudinary') {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: config.cloudinary.folder, resource_type: 'image' },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    }).catch((err) => {
      logger.error('Cloudinary upload failed', { message: err.message });
      throw ApiError.unavailable('Image upload failed. Please try again.', { code: 'UPLOAD_FAILED' });
    });
    return { url: result.secure_url, publicId: result.public_id };
  }
  if (mode === 'local') {
    await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    // Server-generated name: user-supplied filenames never touch the filesystem.
    const name = `${crypto.randomBytes(16).toString('hex')}.${ALLOWED[real]}`;
    await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, name), file.buffer);
    return { url: `/uploads/${name}` };
  }
  throw ApiError.unavailable('Image storage is not configured. Set CLOUDINARY_URL, or add images by URL.', { code: 'STORAGE_NOT_CONFIGURED' });
}

export async function deleteStoredImage(image) {
  try {
    if (image?.publicId && config.cloudinary.url) await cloudinary.uploader.destroy(image.publicId);
    else if (image?.url?.startsWith('/uploads/')) {
      const name = path.basename(image.url);
      await fs.unlink(path.join(LOCAL_UPLOAD_DIR, name)).catch(() => {});
    }
  } catch (err) {
    logger.warn('Could not delete stored image', { message: err.message });
  }
}
