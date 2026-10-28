import mongoose from 'mongoose';
import { Hotel, Review } from '../models/index.js';
import { round2 } from '../utils/money.js';

/** Recomputes a hotel's published rating average/count from stored reviews. */
export async function recomputeHotelRating(hotelId) {
  const [agg] = await Review.aggregate([
    { $match: { hotel: new mongoose.Types.ObjectId(String(hotelId)), status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Hotel.updateOne({ _id: hotelId }, { ratingAvg: agg ? round2(agg.avg) : 0, ratingCount: agg?.count ?? 0 });
}
