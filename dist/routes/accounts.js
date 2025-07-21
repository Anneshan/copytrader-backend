"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const database_1 = __importDefault(require("../config/database"));
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../middleware/errorHandler");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const brokerFactory_1 = require("../services/brokerIntegrations/brokerFactory");
const encryption_1 = require("../utils/encryption");
const router = express_1.default.Router();
router.get('/', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const accounts = await database_1.default.brokerAccount.findMany({
        where: { userId: req.user.id },
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
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('name').trim().isLength({ min: 3, max: 100 }),
    (0, express_validator_1.body)('broker').isIn(['DELTA', 'BINANCE', 'BYBIT', 'OKX']),
    (0, express_validator_1.body)('accountType').isIn(['MASTER', 'FOLLOWER']),
    (0, express_validator_1.body)('apiKey').isLength({ min: 10 }),
    (0, express_validator_1.body)('apiSecret').isLength({ min: 10 }),
    (0, express_validator_1.body)('passphrase').optional().isLength({ min: 1 }),
], (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errors_1.ValidationError('Validation failed', errors.array());
    }
    const { name, broker, accountType, apiKey, apiSecret, passphrase } = req.body;
    const existingAccount = await database_1.default.brokerAccount.findFirst({
        where: {
            userId: req.user.id,
            name,
        },
    });
    if (existingAccount) {
        throw new errors_1.AppError('Account with this name already exists', 409);
    }
    try {
        const brokerInstance = brokerFactory_1.BrokerFactory.createBroker(broker, {
            apiKey,
            apiSecret,
            passphrase,
        });
        const isValid = await brokerInstance.validateCredentials();
        if (!isValid) {
            throw new errors_1.AppError('Invalid broker credentials', 400);
        }
        const balances = await brokerInstance.getAccountBalance();
        const totalBalance = balances.reduce((sum, bal) => sum + bal.total, 0);
        const encryptedApiKey = (0, encryption_1.encryptApiKey)(apiKey);
        const encryptedApiSecret = (0, encryption_1.encryptApiKey)(apiSecret);
        const account = await database_1.default.brokerAccount.create({
            data: {
                userId: req.user.id,
                broker: broker,
                accountType: accountType,
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
        logger_1.logger.info(`Broker account created: ${name} (${broker}) for user ${req.user.email}`);
        res.status(201).json({
            success: true,
            data: { account },
        });
    }
    catch (error) {
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw new errors_1.AppError('Failed to validate broker credentials', 400);
    }
}));
router.put('/:id', auth_1.authenticate, [
    (0, express_validator_1.body)('name').optional().trim().isLength({ min: 3, max: 100 }),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
], (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errors_1.ValidationError('Validation failed', errors.array());
    }
    const { id } = req.params;
    const { name, isActive } = req.body;
    const existingAccount = await database_1.default.brokerAccount.findFirst({
        where: {
            id,
            userId: req.user.id,
        },
    });
    if (!existingAccount) {
        throw new errors_1.AppError('Account not found', 404);
    }
    if (name && name !== existingAccount.name) {
        const nameExists = await database_1.default.brokerAccount.findFirst({
            where: {
                userId: req.user.id,
                name,
                id: { not: id },
            },
        });
        if (nameExists) {
            throw new errors_1.AppError('Account with this name already exists', 409);
        }
    }
    const updateData = {};
    if (name)
        updateData.name = name;
    if (typeof isActive === 'boolean')
        updateData.isActive = isActive;
    const account = await database_1.default.brokerAccount.update({
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
    logger_1.logger.info(`Broker account updated: ${account.name} for user ${req.user.email}`);
    res.json({
        success: true,
        data: { account },
    });
}));
router.delete('/:id', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const account = await database_1.default.brokerAccount.findFirst({
        where: {
            id,
            userId: req.user.id,
        },
    });
    if (!account) {
        throw new errors_1.AppError('Account not found', 404);
    }
    const activeSubscriptions = await database_1.default.subscription.count({
        where: {
            OR: [
                { masterAccountId: id },
                { followerAccountId: id },
            ],
            isActive: true,
        },
    });
    if (activeSubscriptions > 0) {
        throw new errors_1.AppError('Cannot delete account with active subscriptions', 400);
    }
    await database_1.default.brokerAccount.delete({
        where: { id },
    });
    const instanceId = `${account.broker}_${account.id}`;
    await brokerFactory_1.BrokerFactory.disconnectBroker(instanceId);
    logger_1.logger.info(`Broker account deleted: ${account.name} for user ${req.user.email}`);
    res.json({
        success: true,
        message: 'Account deleted successfully',
    });
}));
router.post('/:id/validate', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const account = await database_1.default.brokerAccount.findFirst({
        where: {
            id,
            userId: req.user.id,
        },
    });
    if (!account) {
        throw new errors_1.AppError('Account not found', 404);
    }
    try {
        const apiKey = (0, encryption_1.decryptApiKey)(account.apiKey);
        const apiSecret = (0, encryption_1.decryptApiKey)(account.apiSecret);
        const brokerInstance = brokerFactory_1.BrokerFactory.createBroker(account.broker, {
            apiKey,
            apiSecret,
        });
        const isValid = await brokerInstance.validateCredentials();
        if (isValid) {
            await database_1.default.brokerAccount.update({
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
    }
    catch (error) {
        logger_1.logger.error('Credential validation error:', error);
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
router.post('/:id/sync', auth_1.authenticate, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const account = await database_1.default.brokerAccount.findFirst({
        where: {
            id,
            userId: req.user.id,
        },
    });
    if (!account) {
        throw new errors_1.AppError('Account not found', 404);
    }
    try {
        const apiKey = (0, encryption_1.decryptApiKey)(account.apiKey);
        const apiSecret = (0, encryption_1.decryptApiKey)(account.apiSecret);
        const brokerInstance = brokerFactory_1.BrokerFactory.createBroker(account.broker, {
            apiKey,
            apiSecret,
        });
        const balances = await brokerInstance.getAccountBalance();
        const totalBalance = balances.reduce((sum, bal) => sum + bal.total, 0);
        const positions = await brokerInstance.getPositions();
        const totalPnL = positions.reduce((sum, pos) => sum + pos.pnl, 0);
        const updatedAccount = await database_1.default.brokerAccount.update({
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
        logger_1.logger.info(`Account synced: ${account.name} - Balance: ${totalBalance}, PnL: ${totalPnL}`);
        res.json({
            success: true,
            data: { account: updatedAccount },
        });
    }
    catch (error) {
        logger_1.logger.error('Account sync error:', error);
        throw new errors_1.AppError('Failed to sync account', 500);
    }
}));
router.get('/brokers', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const brokers = brokerFactory_1.BrokerFactory.getSupportedBrokers().map(broker => ({
        type: broker,
        ...brokerFactory_1.BrokerFactory.getBrokerInfo(broker),
    }));
    res.json({
        success: true,
        data: { brokers },
    });
}));
exports.default = router;
//# sourceMappingURL=accounts.js.map