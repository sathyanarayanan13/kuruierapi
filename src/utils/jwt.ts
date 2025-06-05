import jwt from 'jsonwebtoken';
import { ApiResponse } from './response';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'your-refresh-secret';

export class JwtService {
  static generateTokens(userId: string) {
    const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string) {
    try {
      // @ts-ignore
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw ApiResponse.unauthorized('Invalid access token');
    }
  }

  static verifyRefreshToken(token: string) {
    try {
      // @ts-ignore
      return jwt.verify(token, REFRESH_SECRET);
    } catch (error) {
      throw ApiResponse.unauthorized('Invalid refresh token');
    }
  }

  static refreshTokens(refreshToken: string) {
    const decoded = this.verifyRefreshToken(refreshToken) as { userId: string };
    return this.generateTokens(decoded.userId);
  }
} 