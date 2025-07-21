"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.AppError('Access token required', 401);
        }
        const token = authHeader.substring(7);
        if (!token) {
            throw new errors_1.AppError('Access token required', 401);
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const session = await database_1.default.userSession.findFirst({
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
            throw new errors_1.AppError('Invalid or expired token', 401);
        }
        await database_1.default.userSession.update({
            where: { id: session.id },
            data: { lastUsed: new Date() },
        });
        req.user = session.user;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            logger_1.logger.warn('Invalid JWT token:', error.message);
            return next(new errors_1.AppError('Invalid token', 401));
        }
        logger_1.logger.error('Authentication error:', error);
        next(error);
    }
};
exports.authenticate = authenticate;
const authorize = (requiredKycStatus) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new errors_1.AppError('Authentication required', 401));
        }
        if (requiredKycStatus && !requiredKycStatus.includes(req.user.kycStatus)) {
            return next(new errors_1.AppError('KYC verification required', 403));
        }
        next();
    };
};
exports.authorize = authorize;
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }
        const token = authHeader.substring(7);
        if (!token) {
            return next();
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const session = await database_1.default.userSession.findFirst({
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
            await database_1.default.userSession.update({
                where: { id: session.id },
                data: { lastUsed: new Date() },
            });
        }
        next();
    }
    catch (error) {
        logger_1.logger.debug('Optional auth failed:', error);
        next();
    }
};
exports.optionalAuth = optionalAuth;
//# sourceMappingURL=auth.js.map