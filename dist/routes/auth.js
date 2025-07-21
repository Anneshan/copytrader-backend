"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const errorHandler_1 = require("../middleware/errorHandler");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const auth_1 = require("../utils/auth");
const router = express_1.default.Router();
router.post('/register', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    (0, express_validator_1.body)('firstName').trim().isLength({ min: 2, max: 50 }),
    (0, express_validator_1.body)('lastName').trim().isLength({ min: 2, max: 50 }),
], (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errors_1.AppError('Validation failed', 400);
    }
    const { email, password, firstName, lastName } = req.body;
    const existingUser = await database_1.default.user.findUnique({
        where: { email },
    });
    if (existingUser) {
        throw new errors_1.AppError('User already exists', 409);
    }
    const passwordHash = await (0, auth_1.hashPassword)(password);
    const user = await database_1.default.user.create({
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
    const { accessToken, refreshToken } = await (0, auth_1.generateTokens)(user.id, req.ip, req.get('User-Agent'));
    logger_1.logger.info(`User registered: ${email}`);
    res.status(201).json({
        success: true,
        data: {
            user,
            accessToken,
            refreshToken,
        },
    });
}));
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty(),
], (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errors_1.AppError('Validation failed', 400);
    }
    const { email, password } = req.body;
    const user = await database_1.default.user.findUnique({
        where: { email },
    });
    if (!user || !user.isActive) {
        throw new errors_1.AppError('Invalid credentials', 401);
    }
    const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isPasswordValid) {
        throw new errors_1.AppError('Invalid credentials', 401);
    }
    await database_1.default.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
    });
    const { accessToken, refreshToken } = await (0, auth_1.generateTokens)(user.id, req.ip, req.get('User-Agent'));
    logger_1.logger.info(`User logged in: ${email}`);
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
router.post('/refresh', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        throw new errors_1.AppError('Refresh token required', 401);
    }
    const decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const session = await database_1.default.userSession.findFirst({
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
        throw new errors_1.AppError('Invalid refresh token', 401);
    }
    const { accessToken, refreshToken: newRefreshToken } = await (0, auth_1.generateTokens)(session.userId, req.ip, req.get('User-Agent'));
    await database_1.default.userSession.update({
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
router.post('/logout', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7);
    if (token) {
        await database_1.default.userSession.updateMany({
            where: {
                token,
                userId: req.user.id,
            },
            data: {
                isActive: false,
            },
        });
    }
    logger_1.logger.info(`User logged out: ${req.user.email}`);
    res.json({
        success: true,
        message: 'Logged out successfully',
    });
}));
router.get('/profile', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const user = await database_1.default.user.findUnique({
        where: { id: req.user.id },
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
        throw new errors_1.AppError('User not found', 404);
    }
    res.json({
        success: true,
        data: { user },
    });
}));
router.put('/profile', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errors_1.AppError('Validation failed', 400);
    }
    const { firstName, lastName, email } = req.body;
    const updateData = {};
    if (firstName)
        updateData.firstName = firstName;
    if (lastName)
        updateData.lastName = lastName;
    if (email) {
        const existingUser = await database_1.default.user.findFirst({
            where: {
                email,
                id: { not: req.user.id },
            },
        });
        if (existingUser) {
            throw new errors_1.AppError('Email already in use', 409);
        }
        updateData.email = email;
        updateData.emailVerified = false;
    }
    const user = await database_1.default.user.update({
        where: { id: req.user.id },
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
    logger_1.logger.info(`User profile updated: ${user.email}`);
    res.json({
        success: true,
        data: { user },
    });
}));
exports.default = router;
//# sourceMappingURL=auth.js.map