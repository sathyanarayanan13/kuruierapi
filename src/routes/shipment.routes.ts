import { Router } from 'express';
import { ShipmentController } from '../controllers/shipment.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Create a new shipment
router.post('/v1', ShipmentController.createShipment);

// Get all shipments for the authenticated user
router.get('/v1', ShipmentController.getShipments);

// Get details of a specific shipment
router.get('/v1/:shipmentId', ShipmentController.getShipmentDetails);

export default router; 