import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
// Import prisma client from database configuration
import prisma from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    kycStatus: string;
    twoFaEnabled: boolean;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Access token required', 401);
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      throw new AppError('Access token required', 401);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Check if session exists and is active
    const session = await prisma.userSession.findFirst({
      where: {
        token,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycStatus: true,
            twoFaEnabled: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || !session.user.isActive) {
      throw new AppError('Invalid or expired token', 401);
    }

    // Update last used timestamp
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsed: new Date() },
    });

    // Attach user to request
    req.user = session.user;
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token:', error.message);
      return next(new AppError('Invalid token', 401));
    }
    
    logger.error('Authentication error:', error);
    next(error);
  }
};

export const authorize = (requiredKycStatus?: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (requiredKycStatus && !requiredKycStatus.includes(req.user.kycStatus)) {
      return next(new AppError('KYC verification required', 403));
    }

    next();
  };
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    const session = await prisma.userSession.findFirst({
      where: {
        token,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycStatus: true,
            twoFaEnabled: true,
            isActive: true,
          },
        },
      },
    });

    if (session && session.user.isActive) {
      req.user = session.user;
      
      // Update last used timestamp
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastUsed: new Date() },
      });
    }
    
    next();
  } catch (error) {
    // For optional auth, we don't throw errors, just continue without user
    logger.debug('Optional auth failed:', error);
    next();
  }
};