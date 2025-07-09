import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { JwtService } from '../utils/jwt';
import { ApiResponse } from '../utils/response';
import { EmailService } from '../services/email.service';

const prisma = new PrismaClient({
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
      ],
});

prisma.$on('query', (e) => {
    // console.log('Query:', e.query);
    // console.log('Params:', e.params); 
  });

export class UserController {
  static async login(req: Request, res: Response) {
    try {
      const { mobileNumber, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { mobileNumber, isVerified: true }
      });

      if (!user) {
        return res.status(401).json(ApiResponse.unauthorized('Invalid credentials'));
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json(ApiResponse.unauthorized('Invalid credentials'));
      }

      const tokens = JwtService.generateTokens(user.id);
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        mobileNumber: user.mobileNumber,
        currentRole: user.currentRole,
        isVerified: user.isVerified
      };

      return res.json(ApiResponse.success({ user: userData, ...tokens }));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }

  static async signup(req: Request, res: Response) {
    try {
      const { username, email, mobileNumber, password } = req.body;

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { mobileNumber },
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json(ApiResponse.error('User already exists'));
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          username,
          email,
          mobileNumber,
          passwordHash,
          currentRole: 'SHIPMENT_OWNER'
        }
      });

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await prisma.otpVerification.create({
        data: {
          userId: user.id,
          otpCode: otp,
          expiresAt
        }
      });

      await EmailService.sendOtp(email, otp);

      return res.json(ApiResponse.success({ userId: user.id }, 'OTP sent successfully'));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.serverError(error.message));
    }
  }

  static async verifyOtp(req: Request, res: Response) {
    try {
      const { userId, otp } = req.body;

      const otpRecord = await prisma.otpVerification.findFirst({
        where: {
          userId,
          otpCode: otp,
          isUsed: false,
          expiresAt: {
            gt: new Date()
          }
        }
      });

      if (!otpRecord) {
        return res.status(400).json(ApiResponse.error('Invalid or expired OTP'));
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { isVerified: true }
        }),
        prisma.otpVerification.update({
          where: { id: otpRecord.id },
          data: { isUsed: true }
        })
      ]);

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      const tokens = JwtService.generateTokens(user!.id);
      const userData = {
        id: user!.id,
        username: user!.username,
        email: user!.email,
        mobileNumber: user!.mobileNumber,
        currentRole: user!.currentRole,
        isVerified: user!.isVerified
      };

      return res.json(ApiResponse.success({ user: userData, ...tokens }));
    } catch (error: any) {
      return res.status(500).json(ApiResponse.serverError(error.message));
    }
  }

  static async resendOtp(req: Request, res: Response) {
    try {
      const { userId } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json(ApiResponse.notFound('User not found'));
      }

      // Invalidate existing OTPs
      await prisma.otpVerification.updateMany({
        where: {
          userId,
          isUsed: false
        },
        data: { isUsed: true }
      });

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

      await prisma.otpVerification.create({
        data: {
          userId,
          otpCode: otp,
          expiresAt
        }
      });

      await EmailService.sendOtp(user.email, otp);

      return res.json(ApiResponse.success(null, 'New OTP sent successfully'));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }

  static async updateMobileNumber(req: Request, res: Response) {
    try {
      const { userId, newMobileNumber } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { mobileNumber: newMobileNumber }
      });

      if (existingUser) {
        return res.status(400).json(ApiResponse.error('Mobile number already in use'));
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { mobileNumber: newMobileNumber }
      });

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

      await prisma.otpVerification.create({
        data: {
          userId,
          otpCode: otp,
          expiresAt
        }
      });

      await EmailService.sendOtp(user.email, otp);

      return res.json(ApiResponse.success(null, 'Mobile number updated and new OTP sent'));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }

  static async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json(ApiResponse.notFound('User not found'));
      }

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        mobileNumber: user.mobileNumber,
        currentRole: user.currentRole
      };

      return res.json(ApiResponse.success(userData));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }

  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const { username, email, mobileNumber, currentRole } = req.body;

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { mobileNumber },
            { username }
          ],
          NOT: {
            id: userId
          }
        }
      });

      if (existingUser) {
        return res.status(400).json(ApiResponse.error('Username, email, or mobile number already in use'));
      }

      const user = await prisma.$transaction(async (prisma) => {
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            username,
            email,
            mobileNumber,
            currentRole
          }
        });

        if (currentRole) {
          await prisma.userRoleHistory.create({
            data: {
              userId,
              role: currentRole
            }
          });
        }

        return updatedUser;
      });

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        mobileNumber: user.mobileNumber,
        currentRole: user.currentRole
      };

      return res.json(ApiResponse.success(userData, 'Profile updated successfully'));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }

  static async getValidCounts(req: Request, res: Response) {
    try {
      const userId = (req as any).user.userId;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.status(404).json(ApiResponse.notFound('User not found'));
      }
      let validPackageCount = 0;
      let validTravelCount = 0;
      const now = new Date();
      if (user.currentRole === 'SHIPMENT_OWNER') {
        validPackageCount = await prisma.shipment.count({
          where: {
            userId,
            estimatedDeliveryDate: { gt: now },
          },
        });
      }
      if (user.currentRole === 'TRAVELLER') {
        validTravelCount = await prisma.trip.count({
          where: {
            userId,
            departureDate: { gt: now },
          },
        });
      }
      return res.json(ApiResponse.success({ validPackageCount, validTravelCount }));
    } catch (error) {
      return res.status(500).json(ApiResponse.serverError());
    }
  }
} 