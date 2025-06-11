import { Router } from 'express';
import { TripController } from '../controllers/trip.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Create a new trip
router.post('/v1', authMiddleware, TripController.createTrip);

// Get all trips for the authenticated user
router.get('/v1', authMiddleware, TripController.getTrips);

// Get specific trip details
router.get('/v1/:tripId', authMiddleware, TripController.getTripDetails);

export default router; 