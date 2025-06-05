import { Request, Response, NextFunction, RequestHandler } from 'express';
import { JwtService } from '../utils/jwt';
import { ApiResponse } from '../utils/response';

export const authMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json(ApiResponse.unauthorized('No token provided'));
      return;
    }

    const decoded = JwtService.verifyAccessToken(token);
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json(ApiResponse.unauthorized('Invalid token'));
  }
};

export const refreshTokenMiddleware: RequestHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json(ApiResponse.error('Refresh token is required'));
      return;
    }

    const tokens = JwtService.refreshTokens(refreshToken);
    res.json(ApiResponse.success(tokens, 'Tokens refreshed successfully'));
  } catch (error) {
    res.status(401).json(ApiResponse.unauthorized('Invalid refresh token'));
  }
}; 