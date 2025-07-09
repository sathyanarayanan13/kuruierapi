import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, refreshTokenMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Auth routes
// @ts-ignore
router.post('/v1/auth/login', UserController.login);
// @ts-ignore
router.post('/v1/auth/signup', UserController.signup);
// @ts-ignore
router.post('/v1/auth/verify-otp', UserController.verifyOtp);
// @ts-ignore
router.post('/v1/auth/resend-otp', UserController.resendOtp);
// @ts-ignore
router.post('/v1/auth/refresh-token', refreshTokenMiddleware);

// Profile routes
// @ts-ignore
router.get('/v1/profile', authMiddleware, UserController.getProfile);
// @ts-ignore
router.put('/v1/profile', authMiddleware, UserController.updateProfile);
// @ts-ignore
router.put('/v1/profile/mobile', authMiddleware, UserController.updateMobileNumber);
// @ts-ignore
router.get('/v1/valid-counts', authMiddleware, UserController.getValidCounts);

export default router; 