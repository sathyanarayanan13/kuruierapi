import { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../utils/response';
import Stripe from 'stripe';

const prisma = new PrismaClient();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-05-28.basil',
});

export class PaymentController {
  /**
   * Create PaymentIntent for chat unlock
   * This endpoint should be called before showing the payment sheet
   */
  static createPaymentIntent: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { matchId, amount, currency = 'usd' } = req.body;

      if (!matchId || !amount) {
        res.status(400).json(ApiResponse.error('Match ID and amount are required'));
        return;
      }

      // Verify the match exists and user has permission
      const match = await prisma.shipmentTravelMatch.findUnique({
        where: { id: matchId },
        include: { 
          shipment: true,
          trip: true 
        }
      });

      if (!match) {
        res.status(404).json(ApiResponse.notFound('Match not found'));
        return;
      }

      // Only shipment owner can initiate payment
      if (match.shipment.userId !== userId) {
        res.status(403).json(ApiResponse.forbidden('Only shipment owner can unlock chat'));
        return;
      }

      // Check if chat is already unlocked
      const existingChatAccess = await prisma.shipmentChatAccess.findFirst({
        where: { matchId }
      });

      if (existingChatAccess?.unlockedByPayment) {
        res.status(400).json(ApiResponse.error('Chat is already unlocked'));
        return;
      }

      // Create PaymentIntent with Stripe
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: {
          userId,
          matchId,
          shipmentId: match.shipmentId,
          tripId: match.tripId,
          type: 'chat_unlock'
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Store pending payment record
      await prisma.chatPayment.create({
        data: {
          userId,
          shipmentId: match.shipmentId,
          matchId,
          amount: Number(amount),
          paymentStatus: 'PENDING',
          stripePaymentIntentId: paymentIntent.id
        }
      });

      res.json(ApiResponse.success({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }));
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res.status(500).json(ApiResponse.serverError(error.message));
    }
  }

  /**
   * Confirm payment and unlock chat
   * This should be called after successful payment from the client
   */
  static confirmPayment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { paymentIntentId, clientSecret } = req.body;

      if (!paymentIntentId && !clientSecret) {
        res.status(400).json(ApiResponse.error('Payment Intent ID or client secret is required'));
        return;
      }

      // Retrieve PaymentIntent from Stripe to verify payment
      let paymentIntent: Stripe.PaymentIntent;
      
      if (paymentIntentId) {
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      } else {
        // Extract PaymentIntent ID from client secret
        const intentId = clientSecret.split('_secret_')[0];
        paymentIntent = await stripe.paymentIntents.retrieve(intentId);
      }

      if (!paymentIntent) {
        res.status(404).json(ApiResponse.notFound('Payment Intent not found'));
        return;
      }

      // Verify payment was successful
      if (paymentIntent.status !== 'succeeded') {
        res.status(400).json(ApiResponse.error(`Payment not completed. Status: ${paymentIntent.status}`));
        return;
      }

      // Get metadata from PaymentIntent
      const { matchId, shipmentId } = paymentIntent.metadata;

      if (!matchId || !shipmentId) {
        res.status(400).json(ApiResponse.error('Invalid payment metadata'));
        return;
      }

      // Verify user permission
      const match = await prisma.shipmentTravelMatch.findUnique({
        where: { id: matchId },
        include: { shipment: true }
      });

      if (!match || match.shipment.userId !== userId) {
        res.status(403).json(ApiResponse.forbidden('Unauthorized to confirm this payment'));
        return;
      }

      // Update payment record and unlock chat in a transaction
      const result = await prisma.$transaction(async (prisma) => {
        // Update payment status
        const payment = await prisma.chatPayment.updateMany({
          where: {
            stripePaymentIntentId: paymentIntent.id,
            userId
          },
          data: {
            paymentStatus: 'PAID',
            confirmedAt: new Date()
          }
        });

        // Update or create chat access
        const chatAccess = await prisma.shipmentChatAccess.upsert({
          where: { matchId },
          update: {
            unlockedByPayment: true,
            unlockedAt: new Date()
          },
          create: {
            shipmentId,
            tripId: match.tripId,
            matchId,
            unlockedByPayment: true,
            unlockedAt: new Date()
          }
        });

        return { payment, chatAccess };
      });

      res.json(ApiResponse.success({
        message: 'Payment confirmed and chat unlocked successfully',
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100, // Convert back to dollars
          currency: paymentIntent.currency,
          status: paymentIntent.status
        },
        chatAccess: result.chatAccess
      }));
    } catch (error: any) {
      console.error('Error confirming payment:', error);
      res.status(500).json(ApiResponse.serverError(error.message));
    }
  }

  /**
   * Get payment history for user
   */
  static getPaymentHistory: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      const { page = 1, limit = 20 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      const payments = await prisma.chatPayment.findMany({
        where: { userId },
        include: {
          shipment: {
            select: {
              id: true,
              packageType: true,
              destinationCountry: true
            }
          },
          match: {
            include: {
              trip: {
                select: {
                  id: true,
                  fromCountry: true,
                  toCountry: true,
                  departureDate: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const totalPayments = await prisma.chatPayment.count({
        where: { userId }
      });

      res.json(ApiResponse.success({
        payments,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalPayments,
          totalPages: Math.ceil(totalPayments / Number(limit))
        }
      }));
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json(ApiResponse.serverError());
    }
  }

  /**
   * Webhook endpoint for Stripe events (optional but recommended)
   * This ensures payment status is updated even if client-side confirmation fails
   */
  static stripeWebhook: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('Stripe webhook secret not configured');
      res.status(400).send('Webhook secret not configured');
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await handlePaymentSuccess(paymentIntent);
          break;
        
        case 'payment_intent.payment_failed':
          const failedPayment = event.data.object as Stripe.PaymentIntent;
          await handlePaymentFailure(failedPayment);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
}

// Helper function to handle successful payments
async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { matchId, shipmentId } = paymentIntent.metadata;

  if (!matchId || !shipmentId) {
    console.error('Missing metadata in payment intent:', paymentIntent.id);
    return;
  }

  try {
    await prisma.$transaction(async (prisma) => {
      // Update payment status
      await prisma.chatPayment.updateMany({
        where: {
          stripePaymentIntentId: paymentIntent.id
        },
        data: {
          paymentStatus: 'PAID',
          confirmedAt: new Date()
        }
      });

      // Get match details
      const match = await prisma.shipmentTravelMatch.findUnique({
        where: { id: matchId }
      });

      if (match) {
        // Update or create chat access
        await prisma.shipmentChatAccess.upsert({
          where: { matchId },
          update: {
            unlockedByPayment: true,
            unlockedAt: new Date()
          },
          create: {
            shipmentId,
            tripId: match.tripId,
            matchId,
            unlockedByPayment: true,
            unlockedAt: new Date()
          }
        });
      }
    });

    console.log(`Payment confirmed and chat unlocked for match: ${matchId}`);
  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

// Helper function to handle failed payments
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    await prisma.chatPayment.updateMany({
      where: {
        stripePaymentIntentId: paymentIntent.id
      },
      data: {
        paymentStatus: 'FAILED'
      }
    });

    console.log(`Payment failed for intent: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}