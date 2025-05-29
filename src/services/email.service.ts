import nodemailer from 'nodemailer';
import { ApiResponse } from '../utils/response';

export class EmailService {
  private static transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: '8e41a3001@smtp-brevo.com',
      pass: 'JXQMZIVz27Ny4ktU'
    }
  });

  static async sendOtp(email: string, otp: string) {
    try {
      const mailOptions = {
        from: 'sathya.naran05@gmail.com',
        to: email,
        subject: 'Your OTP for Kuruier App',
        html: `
          <h1>OTP Verification</h1>
          <p>Your OTP for Kuruier App is: <strong>${otp}</strong></p>
          <p>This OTP is valid for 5 minutes.</p>
        `
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error: any) {
      throw ApiResponse.serverError(error.message || 'Failed to send OTP email');
    }
  }
} 