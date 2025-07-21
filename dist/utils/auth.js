"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.generateTokens = exports.comparePassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = __importDefault(require("../config/database"));
const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
    return bcryptjs_1.default.hash(password, saltRounds);
};
exports.hashPassword = hashPassword;
const comparePassword = async (password, hash) => {
    return bcryptjs_1.default.compare(password, hash);
};
exports.comparePassword = comparePassword;
const generateTokens = async (userId, ipAddress, userAgent) => {
    const accessTokenPayload = {
        userId,
        type: 'access',
    };
    const refreshTokenPayload = {
        userId,
        type: 'refresh',
    };
    const accessToken = jsonwebtoken_1.default.sign(accessTokenPayload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const refreshToken = jsonwebtoken_1.default.sign(refreshTokenPayload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await database_1.default.userSession.create({
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
exports.generateTokens = generateTokens;
const verifyToken = (token, secret) => {
    return jsonwebtoken_1.default.verify(token, secret);
};
exports.verifyToken = verifyToken;
//# sourceMappingURL=auth.js.map