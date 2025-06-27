import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import express from 'express';

const router = Router();

// Stripe webhook endpoint (must be before other middleware that parses JSON)
router.post('/webhook/stripe', 
  express.raw({ type: 'application/json' }), 
  PaymentController.stripeWebhook
);

// All other payment routes require authentication
router.use(authMiddleware);

// Create PaymentIntent for chat unlock
router.post('/v1/create-intent', PaymentController.createPaymentIntent);

// Confirm payment and unlock chat
router.post('/v1/confirm', PaymentController.confirmPayment);

// Get payment history
router.get('/v1/history', PaymentController.getPaymentHistory);

export default router;