import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Import prisma client from database configuration
import prisma from '../config/database';

export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return bcrypt.hash(password, saltRounds);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateTokens = async (
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessTokenPayload = {
    userId,
    type: 'access',
  };

  const refreshTokenPayload = {
    userId,
    type: 'refresh',
  };

  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

  // Store session in database
  await prisma.userSession.create({
    data: {
      userId,
      token: accessToken,
      refreshToken,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return { accessToken, refreshToken };
};

export const verifyToken = (token: string, secret: string): any => {
  return jwt.verify(token, secret);
};