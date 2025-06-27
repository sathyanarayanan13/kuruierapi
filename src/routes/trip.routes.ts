import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Create a new trip
router.post('/v1', authMiddleware, TripController.createTrip);

// Get all trips excluding current user's trips (for shipment owners to browse)
router.get('/v1', authMiddleware, TripController.getTrips);

// Get current user's own trips for management
router.get('/v1/my-trips', authMiddleware, TripController.getMyTrips);

// Get specific trip details (from other users)
router.get('/v1/:tripId', authMiddleware, TripController.getTripDetails);

export default router;