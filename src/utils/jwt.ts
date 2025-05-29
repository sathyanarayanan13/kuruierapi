import jwt from 'jsonwebtoken';
import { ApiResponse } from './response';

export class JwtService {
  private static accessSecret = process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-key';
  private static refreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret-key';
  private static accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  private static refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  static generateTokens(userId: string) {
    // @ts-ignore
    const accessToken = jwt.sign({ userId }, this.accessSecret, { expiresIn: this.accessExpiresIn });
    // @ts-ignore
    const refreshToken = jwt.sign({ userId }, this.refreshSecret, { expiresIn: this.refreshExpiresIn });

    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string) {
    try {
      // @ts-ignore
      return jwt.verify(token, this.accessSecret);
    } catch (error) {
      throw ApiResponse.unauthorized('Invalid access token');
    }
  }

  static verifyRefreshToken(token: string) {
    try {
      // @ts-ignore
      return jwt.verify(token, this.refreshSecret);
    } catch (error) {
      throw ApiResponse.unauthorized('Invalid refresh token');
    }
  }

  static refreshTokens(refreshToken: string) {
    const decoded = this.verifyRefreshToken(refreshToken);
    return this.generateTokens((decoded as any).userId);
  }
} 