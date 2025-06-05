import { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../utils/response';

const prisma = new PrismaClient();

export class ShipmentController {
  static createShipment: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const {
        packageType,
        estimatedDeliveryDate,
        weightGrams,
        destinationCountry,
        packageImageUrl,
        lat_coordinates,
        long_coordinates
      } = req.body;

      // Validate required fields
      if (!packageType || !estimatedDeliveryDate || !weightGrams || !destinationCountry) {
        res.status(400).json(ApiResponse.error('Missing required fields'));
        return;
      }

      const shipment = await prisma.shipment.create({
        data: {
          userId,
          packageType,
          estimatedDeliveryDate: new Date(estimatedDeliveryDate),
          weightGrams,
          destinationCountry,
          packageImageUrl,
          lat_coordinates,
          long_coordinates
        }
      });

      // Find matching travellers
      const matchingTrips = await prisma.trip.findMany({
        where: {
          toCountry: destinationCountry,
          status: 'ACCEPTING',
          departureDate: {
            gte: new Date()
          }
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              mobileNumber: true
            }
          }
        }
      });

      res.json(ApiResponse.success({
        shipment,
        matchingTravellers: matchingTrips
      }));
    } catch (error) {
      console.error('Create shipment error:', error);
      res.status(500).json(ApiResponse.serverError());
    }
  }

  static getShipments: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const shipments = await prisma.shipment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      res.json(ApiResponse.success(shipments));
    } catch (error) {
      console.error('Get shipments error:', error);
      res.status(500).json(ApiResponse.serverError());
    }
  }

  static getShipmentDetails: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { shipmentId } = req.params;
      const userId = (req as any).user.userId;

      const shipment = await prisma.shipment.findFirst({
        where: {
          id: shipmentId,
          userId
        }
      });

      if (!shipment) {
        res.status(404).json(ApiResponse.notFound('Shipment not found'));
        return;
      }

      // Get matching travellers for this shipment
      const matchingTrips = await prisma.trip.findMany({
        where: {
          toCountry: shipment.destinationCountry,
          status: 'ACCEPTING',
          departureDate: {
            gte: new Date()
          }
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              mobileNumber: true
            }
          }
        }
      });

      res.json(ApiResponse.success({
        shipment,
        matchingTravellers: matchingTrips
      }));
    } catch (error) {
      console.error('Get shipment details error:', error);
      res.status(500).json(ApiResponse.serverError());
    }
  }
} 