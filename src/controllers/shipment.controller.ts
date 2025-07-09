import { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';
import { ApiResponse } from '../utils/response';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = 'uploads/packages';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'package-' + uniqueSuffix + path.extname(file.originalname || '.jpg'));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.originalname && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      console.log('Accepting file anyway for React Native compatibility');
      cb(null, true);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const uploadMiddleware = upload.any();

export class ShipmentController {
  static createShipment: RequestHandler = async (req: Request, res: Response): Promise<void> => {

    uploadMiddleware(req, res, async (err) => {
      if (err) {
        res.status(400).json(ApiResponse.error(err.message));
        return;
      }

      try {
        const userId = (req as any).user?.userId;

        if (!userId) {
          res.status(401).json(ApiResponse.error('User not authenticated'));
          return;
        }

        let packageType, estimatedDeliveryDate, weightGrams, destinationCountry, lat_coordinates, long_coordinates;
        
        if (req.body && req.body._parts && Array.isArray(req.body._parts)) {
          const parsedBody: any = {};
          
          req.body._parts.forEach((part: any[], index: number) => {
            if (Array.isArray(part) && part.length === 2) {
              const [key, value] = part;
              if (key !== 'packageImage') { 
                parsedBody[key] = value;
              }
            }
          });
          
          packageType = parsedBody.packageType;
          estimatedDeliveryDate = parsedBody.estimatedDeliveryDate;
          weightGrams = parsedBody.weightGrams;
          destinationCountry = parsedBody.destinationCountry;
          lat_coordinates = parsedBody.lat_coordinates;
          long_coordinates = parsedBody.long_coordinates;
        } else {
          ({
            packageType,
            estimatedDeliveryDate,
            weightGrams,
            destinationCountry,
            lat_coordinates,
            long_coordinates
          } = req.body);
        }

        const weightInGrams = weightGrams ? parseInt(weightGrams.toString(), 10) : null;

        const missingFields = [];
        if (!packageType) missingFields.push('packageType');
        if (!estimatedDeliveryDate) missingFields.push('estimatedDeliveryDate');
        if (!weightInGrams) missingFields.push('weightGrams');
        if (!destinationCountry) missingFields.push('destinationCountry');

        if (missingFields.length > 0) {
          res.status(400).json(ApiResponse.error(`Missing required fields: ${missingFields.join(', ')}`));
          return;
        }

        const lat = lat_coordinates ? lat_coordinates.toString() : null;
        const lng = long_coordinates ? long_coordinates.toString() : null;

        let packageImageUrl = null;
        
        if (req.file) {
          packageImageUrl = `/uploads/packages/${req.file.filename}`;
        } else if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          const imageFile = req.files.find(file => 
            file.fieldname === 'packageImage' || 
            file.originalname?.includes('image') ||
            file.mimetype?.startsWith('image/')
          );
          if (imageFile) {
            packageImageUrl = `/uploads/packages/${imageFile.filename}`;
          }
        }

        const shipmentData = {
          packageType,
          estimatedDeliveryDate: new Date(estimatedDeliveryDate),
          weightGrams: weightInGrams as number, 
          destinationCountry,
          packageImageUrl,
          lat_coordinates: lat,
          long_coordinates: lng,
          user: {
            connect: { id: userId }
          }
        };

        const shipment = await prisma.shipment.create({
          data: shipmentData
        });

        // Find matching trips for this shipment (exclude current user's trips)
        const matchingTrips = await prisma.trip.findMany({
          where: {
            toCountry: destinationCountry,
            status: 'ACCEPTING',
            departureDate: {
              gte: new Date()
            },
            userId: {
              not: userId // Exclude current user's trips
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
        res.status(500).json(ApiResponse.serverError());
      }
    });
  }

  /**
   * Get all shipments excluding current user's shipments
   * This allows travelers to see available shipments from other users
   */
  static getShipments: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      const { destinationCountry } = req.query;
      
      // Build where clause
      const whereClause: any = {
        userId: {
          not: userId // Exclude current user's shipments
        },
        status: 'PENDING' // Only show pending shipments that need travelers
      };

      // Add destination country filter if provided
      if (destinationCountry) {
        whereClause.destinationCountry = destinationCountry;
      }

      // Get all shipments excluding current user's shipments
      // This allows travelers to see available shipments from other shipment owners
      const shipments = await prisma.shipment.findMany({
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
        orderBy: { estimatedDeliveryDate: 'asc' } // Show nearest delivery dates first
      });

      res.json(ApiResponse.success(shipments));
    } catch (error) {
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
          userId: {
            not: userId // Allow viewing other users' shipment details
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

      if (!shipment) {
        res.status(404).json(ApiResponse.notFound('Shipment not found or access denied'));
        return;
      }

      // Find matching trips for this shipment (exclude current user's trips)
      const matchingTrips = await prisma.trip.findMany({
        where: {
          toCountry: shipment.destinationCountry,
          status: 'ACCEPTING',
          departureDate: {
            gte: new Date()
          },
          userId: {
            not: userId // Exclude current user's trips
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
      res.status(500).json(ApiResponse.serverError());
    }
  }

  /**
   * New endpoint to get current user's own shipments for management
   */
  static getMyShipments: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.userId;
      
      const myShipments = await prisma.shipment.findMany({
        where: { userId }, // Only current user's shipments
        orderBy: { createdAt: 'desc' }
      });

      res.json(ApiResponse.success(myShipments));
    } catch (error) {
      res.status(500).json(ApiResponse.serverError());
    }
  }
}