import { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../utils/response';

const prisma = new PrismaClient();

export class TripController {
  static createTrip: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json(ApiResponse.error('User not authenticated'));
        return;
      }

      const {
        pnrNumber,
        fromCountry,
        toCountry,
        departureDate,
        flightInfo,
        lat_coordinates,
        long_coordinates
      } = req.body;

      // Validate required fields
      const missingFields = [];
      if (!pnrNumber) missingFields.push('pnrNumber');
      if (!fromCountry) missingFields.push('fromCountry');
      if (!toCountry) missingFields.push('toCountry');
      if (!departureDate) missingFields.push('departureDate');

      if (missingFields.length > 0) {
        res.status(400).json(ApiResponse.error(`Missing required fields: ${missingFields.join(', ')}`));
        return;
      }

      // Parse coordinates as strings or null
      const lat = lat_coordinates ? lat_coordinates.toString() : null;
      const lng = long_coordinates ? long_coordinates.toString() : null;

      const tripData = {
        pnrNumber,
        fromCountry,
        toCountry,
        departureDate: new Date(departureDate),
        flightInfo: flightInfo || null,
        lat_coordinates: lat,
        long_coordinates: lng,
        user: {
          connect: { id: userId }
        }
      };

      const trip = await prisma.trip.create({
        data: tripData
      });

      // Find matching shipments for this trip (exclude current user's shipments)
      const matchingShipments = await prisma.shipment.findMany({
        where: {
          destinationCountry: toCountry,
          status: 'PENDING',
          estimatedDeliveryDate: {
            lte: new Date(departureDate)
          },
          userId: {
            not: userId // Exclude current user's shipments
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
        trip,
        matchingShipments
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  static getTrips: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { destinationCountry } = req.query;
      
      // Build where clause
      const whereClause: any = { 
        userId: {
          not: userId // Exclude current user's trips
        },
        //atus: 'ACCEPTING', // Only show trips that are accepting packages
        departureDate: {
          gte: new Date() // Only show future trips
        }
      };

      // Add destination country filter if provided
      if (destinationCountry) {
        whereClause.toCountry = destinationCountry;
      }

      // Get all trips excluding current user's trips
      // This allows users to see available trips from other travelers
      const trips = await prisma.trip.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              mobileNumber: true
            }
          }
        },
        orderBy: { departureDate: 'asc' } // Show nearest departure dates first
      });

      res.json(ApiResponse.success(trips));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  static getTripDetails: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { tripId } = req.params;
      const userId = (req as any).user.userId;

      const trip = await prisma.trip.findFirst({
        where: {
          id: tripId,
          userId: {
            not: userId // Allow viewing other users' trip details
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

      if (!trip) {
        res.status(404).json(ApiResponse.notFound('Trip not found or access denied'));
        return;
      }

      // Find matching shipments for this trip (exclude current user's shipments)
      const matchingShipments = await prisma.shipment.findMany({
        where: {
          destinationCountry: trip.toCountry,
          status: 'PENDING',
          estimatedDeliveryDate: {
            lte: trip.departureDate
          },
          userId: {
            not: userId // Exclude current user's shipments
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
        trip,
        matchingShipments
      }));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }

  // New endpoint to get current user's own trips for management
  static getMyTrips: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      
      const myTrips = await prisma.trip.findMany({
        where: { userId }, // Only current user's trips
        orderBy: { createdAt: 'desc' }
      });

      res.json(ApiResponse.success(myTrips));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }
}