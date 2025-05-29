import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticateToken, refreshTokenMiddleware } from '../middleware/auth.middleware';

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
router.get('/v1/profile', authenticateToken, UserController.getProfile);
// @ts-ignore
router.put('/v1/profile', authenticateToken, UserController.updateProfile);
// @ts-ignore
router.put('/v1/profile/mobile', authenticateToken, UserController.updateMobileNumber);

export default router; 