import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../utils/jwt';
import { ApiResponse } from '../utils/response';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json(ApiResponse.unauthorized('No token provided'));
    }

    const decoded = JwtService.verifyAccessToken(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json(ApiResponse.unauthorized('Invalid token'));
  }
};

export const refreshTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json(ApiResponse.error('Refresh token is required'));
    }

    const tokens = JwtService.refreshTokens(refreshToken);
    return res.json(ApiResponse.success(tokens, 'Tokens refreshed successfully'));
  } catch (error) {
    return res.status(401).json(ApiResponse.unauthorized('Invalid refresh token'));
  }
}; 