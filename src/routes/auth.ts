import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Import prisma client from database configuration
import prisma from '../config/database';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { generateTokens, hashPassword } from '../utils/auth';
import { AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 }),
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { email, password, firstName, lastName } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError('User already exists', 409);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycStatus: true,
      twoFaEnabled: true,
      createdAt: true,
    },
  });

  // Generate tokens
  const { accessToken, refreshToken } = await generateTokens(user.id, req.ip, req.get('User-Agent'));

  logger.info(`User registered: ${email}`);

  res.status(201).json({
    success: true,
    data: {
      user,
      accessToken,
      refreshToken,
    },
  });
}));

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], asyncHandler(async (req: express.Request, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new AppError('Invalid credentials', 401);
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Generate tokens
  const { accessToken, refreshToken } = await generateTokens(user.id, req.ip, req.get('User-Agent'));

  logger.info(`User logged in: ${email}`);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        kycStatus: user.kycStatus,
        twoFaEnabled: user.twoFaEnabled,
      },
      accessToken,
      refreshToken,
    },
  });
}));

// Refresh token
router.post('/refresh', asyncHandler(async (req: express.Request, res: express.Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError('Refresh token required', 401);
  }

  // Verify refresh token
  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;

  // Find session
  const session = await prisma.userSession.findFirst({
    where: {
      refreshToken,
      isActive: true,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session || !session.user.isActive) {
    throw new AppError('Invalid refresh token', 401);
  }

  // Generate new tokens
  const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
    session.userId,
    req.ip,
    req.get('User-Agent')
  );

  // Deactivate old session
  await prisma.userSession.update({
    where: { id: session.id },
    data: { isActive: false },
  });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: newRefreshToken,
    },
  });
}));

// Logout
router.post('/logout', asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.substring(7);

  if (token) {
    // Deactivate session
    await prisma.userSession.updateMany({
      where: {
        token,
        userId: req.user!.id,
      },
      data: {
        isActive: false,
      },
    });
  }

  logger.info(`User logged out: ${req.user!.email}`);

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycStatus: true,
      twoFaEnabled: true,
      createdAt: true,
      lastLogin: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  res.json({
    success: true,
    data: { user },
  });
}));

// Update profile
router.put('/profile', asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('Validation failed', 400);
  }

  const { firstName, lastName, email } = req.body;
  const updateData: any = {};

  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (email) {
    // Check if email is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: req.user!.id },
      },
    });

    if (existingUser) {
      throw new AppError('Email already in use', 409);
    }

    updateData.email = email;
    updateData.emailVerified = false; // Reset email verification
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      kycStatus: true,
      twoFaEnabled: true,
      emailVerified: true,
    },
  });

  logger.info(`User profile updated: ${user.email}`);

  res.json({
    success: true,
    data: { user },
  });
}));

export default router;