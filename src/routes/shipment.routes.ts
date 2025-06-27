import { Router } from 'express';
import { ShipmentController } from '../controllers/shipment.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Create a new shipment
router.post('/v1', ShipmentController.createShipment);

// Get all shipments excluding current user's shipments (for travelers to browse)
router.get('/v1', ShipmentController.getShipments);

// Get current user's own shipments for management
router.get('/v1/my-shipments', ShipmentController.getMyShipments);

// Get details of a specific shipment (from other users)
router.get('/v1/:shipmentId', ShipmentController.getShipmentDetails);

export default router;