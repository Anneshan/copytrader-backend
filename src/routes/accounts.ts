import express from 'express';
import { body, validationResult } from 'express-validator';
// Import prisma client from database configuration
import prisma from '../config/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { BrokerFactory, SupportedBroker } from '../services/brokerIntegrations/brokerFactory';
import { encryptApiKey, decryptApiKey } from '../utils/encryption';

const router = express.Router();

// Get all broker accounts for user
router.get('/', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const accounts = await prisma.brokerAccount.findMany({
    where: { userId: req.user!.id },
    select: {
      id: true,
      broker: true,
      accountType: true,
      name: true,
      isActive: true,
      balance: true,
      pnl: true,
      lastSync: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: { accounts },
  });
}));

// Add new broker account
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 3, max: 100 }),
  body('broker').isIn(['DELTA', 'BINANCE', 'BYBIT', 'OKX']),
  body('accountType').isIn(['MASTER', 'FOLLOWER']),
  body('apiKey').isLength({ min: 10 }),
  body('apiSecret').isLength({ min: 10 }),
  body('passphrase').optional().isLength({ min: 1 }),
], asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { name, broker, accountType, apiKey, apiSecret, passphrase } = req.body;

  // Check if account with same name already exists
  const existingAccount = await prisma.brokerAccount.findFirst({
    where: {
      userId: req.user!.id,
      name,
    },
  });

  if (existingAccount) {
    throw new AppError('Account with this name already exists', 409);
  }

  // Validate broker credentials
  try {
    const brokerInstance = BrokerFactory.createBroker(broker as SupportedBroker, {
      apiKey,
      apiSecret,
      passphrase,
    });

    const isValid = await brokerInstance.validateCredentials();
    if (!isValid) {
      throw new AppError('Invalid broker credentials', 400);
    }

    // Get initial balance
    const balances = await brokerInstance.getAccountBalance();
    const totalBalance = balances.reduce((sum, bal) => sum + bal.total, 0);

    // Encrypt API credentials
    const encryptedApiKey = encryptApiKey(apiKey);
    const encryptedApiSecret = encryptApiKey(apiSecret);

    // Create account
    const account = await prisma.brokerAccount.create({
      data: {
        userId: req.user!.id,
        broker: broker as any,
        accountType: accountType as any,
        name,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        isActive: true,
        balance: totalBalance,
        pnl: 0,
      },
      select: {
        id: true,
        broker: true,
        accountType: true,
        name: true,
        isActive: true,
        balance: true,
        pnl: true,
        lastSync: true,
        createdAt: true,
      },
    });

    logger.info(`Broker account created: ${name} (${broker}) for user ${req.user!.email}`);

    res.status(201).json({
      success: true,
      data: { account },
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Failed to validate broker credentials', 400);
  }
}));

// Update broker account
router.put('/:id', authenticate, [
  body('name').optional().trim().isLength({ min: 3, max: 100 }),
  body('isActive').optional().isBoolean(),
], asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { id } = req.params;
  const { name, isActive } = req.body;

  // Check if account exists and belongs to user
  const existingAccount = await prisma.brokerAccount.findFirst({
    where: {
      id,
      userId: req.user!.id,
    },
  });

  if (!existingAccount) {
    throw new AppError('Account not found', 404);
  }

  // Check if name is already taken (if updating name)
  if (name && name !== existingAccount.name) {
    const nameExists = await prisma.brokerAccount.findFirst({
      where: {
        userId: req.user!.id,
        name,
        id: { not: id },
      },
    });

    if (nameExists) {
      throw new AppError('Account with this name already exists', 409);
    }
  }

  const updateData: any = {};
  if (name) updateData.name = name;
  if (typeof isActive === 'boolean') updateData.isActive = isActive;

  const account = await prisma.brokerAccount.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      broker: true,
      accountType: true,
      name: true,
      isActive: true,
      balance: true,
      pnl: true,
      lastSync: true,
      createdAt: true,
    },
  });

  logger.info(`Broker account updated: ${account.name} for user ${req.user!.email}`);

  res.json({
    success: true,
    data: { account },
  });
}));

// Delete broker account
router.delete('/:id', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;

  // Check if account exists and belongs to user
  const account = await prisma.brokerAccount.findFirst({
    where: {
      id,
      userId: req.user!.id,
    },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Check if account is used in active subscriptions
  const activeSubscriptions = await prisma.subscription.count({
    where: {
      OR: [
        { masterAccountId: id },
        { followerAccountId: id },
      ],
      isActive: true,
    },
  });

  if (activeSubscriptions > 0) {
    throw new AppError('Cannot delete account with active subscriptions', 400);
  }

  // Delete account
  await prisma.brokerAccount.delete({
    where: { id },
  });

  // Disconnect broker instance if exists
  const instanceId = `${account.broker}_${account.id}`;
  await BrokerFactory.disconnectBroker(instanceId);

  logger.info(`Broker account deleted: ${account.name} for user ${req.user!.email}`);

  res.json({
    success: true,
    message: 'Account deleted successfully',
  });
}));

// Validate broker credentials
router.post('/:id/validate', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;

  // Get account
  const account = await prisma.brokerAccount.findFirst({
    where: {
      id,
      userId: req.user!.id,
    },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  try {
    // Decrypt credentials
    const apiKey = decryptApiKey(account.apiKey);
    const apiSecret = decryptApiKey(account.apiSecret);

    // Create broker instance and validate
    const brokerInstance = BrokerFactory.createBroker(account.broker as SupportedBroker, {
      apiKey,
      apiSecret,
    });

    const isValid = await brokerInstance.validateCredentials();

    if (isValid) {
      // Update last sync time
      await prisma.brokerAccount.update({
        where: { id },
        data: { lastSync: new Date() },
      });
    }

    res.json({
      success: true,
      data: {
        isValid,
        lastChecked: new Date(),
      },
    });
  } catch (error) {
    logger.error('Credential validation error:', error);
    res.json({
      success: true,
      data: {
        isValid: false,
        error: 'Validation failed',
        lastChecked: new Date(),
      },
    });
  }
}));

// Sync account balance
router.post('/:id/sync', authenticate, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  const { id } = req.params;

  // Get account
  const account = await prisma.brokerAccount.findFirst({
    where: {
      id,
      userId: req.user!.id,
    },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  try {
    // Decrypt credentials
    const apiKey = decryptApiKey(account.apiKey);
    const apiSecret = decryptApiKey(account.apiSecret);

    // Create broker instance
    const brokerInstance = BrokerFactory.createBroker(account.broker as SupportedBroker, {
      apiKey,
      apiSecret,
    });

    // Get current balance
    const balances = await brokerInstance.getAccountBalance();
    const totalBalance = balances.reduce((sum, bal) => sum + bal.total, 0);

    // Get positions for PnL calculation
    const positions = await brokerInstance.getPositions();
    const totalPnL = positions.reduce((sum, pos) => sum + pos.pnl, 0);

    // Update account
    const updatedAccount = await prisma.brokerAccount.update({
      where: { id },
      data: {
        balance: totalBalance,
        pnl: totalPnL,
        lastSync: new Date(),
      },
      select: {
        id: true,
        broker: true,
        accountType: true,
        name: true,
        isActive: true,
        balance: true,
        pnl: true,
        lastSync: true,
        createdAt: true,
      },
    });

    logger.info(`Account synced: ${account.name} - Balance: ${totalBalance}, PnL: ${totalPnL}`);

    res.json({
      success: true,
      data: { account: updatedAccount },
    });
  } catch (error) {
    logger.error('Account sync error:', error);
    throw new AppError('Failed to sync account', 500);
  }
}));

// Get supported brokers
router.get('/brokers', asyncHandler(async (req: express.Request, res: express.Response) => {
  const brokers = BrokerFactory.getSupportedBrokers().map(broker => ({
    type: broker,
    ...BrokerFactory.getBrokerInfo(broker),
  }));

  res.json({
    success: true,
    data: { brokers },
  });
}));

export default router;