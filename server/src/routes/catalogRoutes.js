import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/catalogController.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { imageUpload } from '../services/uploadService.js';
import * as v from '../validators/catalog.js';
import { idParam, objectId } from '../validators/common.js';

const imageParams = z.object({ id: objectId, imageId: objectId });

/* /api/hotels */
export const hotelRoutes = Router();
hotelRoutes.get('/', optionalAuth, validate({ query: v.hotelListQuery }), c.listHotels);
hotelRoutes.get('/:idOrSlug', optionalAuth, c.getHotel);
hotelRoutes.post('/', authenticate, authorize('admin'), validate({ body: v.hotelCreateSchema }), c.createHotel);
hotelRoutes.patch('/:id', authenticate, authorize('admin', 'manager'), validate({ params: idParam, body: v.hotelUpdateSchema }), c.updateHotel);
hotelRoutes.delete('/:id', authenticate, authorize('admin'), validate({ params: idParam }), c.deleteHotel);
hotelRoutes.post('/:id/images', authenticate, authorize('admin', 'manager'), validate({ params: idParam }), imageUpload, c.uploadImage('hotel'));
hotelRoutes.delete('/:id/images/:imageId', authenticate, authorize('admin', 'manager'), validate({ params: imageParams }), c.deleteImage('hotel'));

/* /api/room-types */
export const roomTypeRoutes = Router();
roomTypeRoutes.get('/', optionalAuth, c.listRoomTypes);
roomTypeRoutes.get('/:id', optionalAuth, validate({ params: idParam }), c.getRoomType);
roomTypeRoutes.get('/:id/availability', validate({ params: idParam, query: v.availabilityQuery }), c.checkAvailability);
roomTypeRoutes.post('/', authenticate, authorize('admin', 'manager'), validate({ body: v.categoryCreateSchema }), c.createRoomType);
roomTypeRoutes.patch('/:id', authenticate, authorize('admin', 'manager'), validate({ params: idParam, body: v.categoryUpdateSchema }), c.updateRoomType);
roomTypeRoutes.delete('/:id', authenticate, authorize('admin', 'manager'), validate({ params: idParam }), c.deleteRoomType);
roomTypeRoutes.post('/:id/images', authenticate, authorize('admin', 'manager'), validate({ params: idParam }), imageUpload, c.uploadImage('category'));
roomTypeRoutes.delete('/:id/images/:imageId', authenticate, authorize('admin', 'manager'), validate({ params: imageParams }), c.deleteImage('category'));

/* /api/rooms (physical rooms — operations only) */
export const roomRoutes = Router();
roomRoutes.use(authenticate, authorize('admin', 'manager', 'staff'));
roomRoutes.get('/', validate({ query: v.roomListQuery }), c.listRooms);
roomRoutes.post('/', authorize('admin', 'manager'), validate({ body: v.roomCreateSchema }), c.createRoom);
roomRoutes.patch('/:id', authorize('admin', 'manager'), validate({ params: idParam, body: v.roomUpdateSchema }), c.updateRoom);
roomRoutes.patch('/:id/status', validate({ params: idParam, body: v.roomStatusSchema }), c.updateRoomStatus);
roomRoutes.delete('/:id', authorize('admin', 'manager'), validate({ params: idParam }), c.deleteRoom);

/* /api/search */
export const searchRoutes = Router();
searchRoutes.get('/', validate({ query: v.searchQuery }), c.search);
