"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSecureToken = exports.hashPassword = exports.decryptApiKey = exports.encryptApiKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key-here';
const ALGORITHM = 'aes-256-gcm';
if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
}
const encryptApiKey = (text) => {
    try {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipher(ALGORITHM, ENCRYPTION_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    catch (error) {
        throw new Error('Encryption failed');
    }
};
exports.encryptApiKey = encryptApiKey;
const decryptApiKey = (encryptedText) => {
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) {
            throw new Error('Invalid encrypted format');
        }
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto_1.default.createDecipher(ALGORITHM, ENCRYPTION_KEY);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        throw new Error('Decryption failed');
    }
};
exports.decryptApiKey = decryptApiKey;
const hashPassword = (password) => {
    return crypto_1.default.createHash('sha256').update(password).digest('hex');
};
exports.hashPassword = hashPassword;
const generateSecureToken = (length = 32) => {
    return crypto_1.default.randomBytes(length).toString('hex');
};
exports.generateSecureToken = generateSecureToken;
//# sourceMappingURL=encryption.js.map