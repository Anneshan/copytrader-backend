"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBroker = void 0;
const events_1 = require("events");
const logger_1 = require("../../utils/logger");
class BaseBroker extends events_1.EventEmitter {
    constructor(credentials) {
        super();
        this.isConnected = false;
        this.rateLimiter = new Map();
        this.credentials = credentials;
    }
    checkRateLimit(endpoint, limit, windowMs) {
        const now = Date.now();
        const key = `${endpoint}_${Math.floor(now / windowMs)}`;
        const current = this.rateLimiter.get(key) || 0;
        if (current >= limit) {
            logger_1.logger.warn(`Rate limit exceeded for ${endpoint}`);
            return false;
        }
        this.rateLimiter.set(key, current + 1);
        for (const [k, v] of this.rateLimiter.entries()) {
            if (k.split('_')[1] && parseInt(k.split('_')[1]) < Math.floor((now - windowMs) / windowMs)) {
                this.rateLimiter.delete(k);
            }
        }
        return true;
    }
    handleError(error, context) {
        logger_1.logger.error(`Broker error in ${context}:`, error);
        if (error.response?.status === 401) {
            return new Error('Invalid API credentials');
        }
        else if (error.response?.status === 429) {
            return new Error('Rate limit exceeded');
        }
        else if (error.response?.status >= 500) {
            return new Error('Broker service unavailable');
        }
        else if (error.code === 'ECONNREFUSED') {
            return new Error('Connection refused by broker');
        }
        else if (error.code === 'ETIMEDOUT') {
            return new Error('Request timeout');
        }
        return new Error(error.message || 'Unknown broker error');
    }
    async healthCheck() {
        try {
            return await this.validateCredentials();
        }
        catch (error) {
            logger_1.logger.error('Broker health check failed:', error);
            return false;
        }
    }
    getConnectionStatus() {
        return this.isConnected;
    }
}
exports.BaseBroker = BaseBroker;
//# sourceMappingURL=baseBroker.js.map