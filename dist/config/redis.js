"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCache = exports.getCache = exports.setCache = exports.checkRedisHealth = exports.disconnectRedis = exports.getRedisClient = exports.connectRedis = void 0;
const redis_1 = require("redis");
const logger_1 = require("../utils/logger");
let redisClient;
const connectRedis = async () => {
    try {
        redisClient = (0, redis_1.createClient)({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });
        redisClient.on('error', (err) => {
            logger_1.logger.error('Redis Client Error:', err);
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('Redis client connected');
        });
        redisClient.on('ready', () => {
            logger_1.logger.info('Redis client ready');
        });
        redisClient.on('end', () => {
            logger_1.logger.info('Redis client disconnected');
        });
        await redisClient.connect();
    }
    catch (error) {
        logger_1.logger.error('Redis connection failed:', error);
        throw error;
    }
};
exports.connectRedis = connectRedis;
const getRedisClient = () => {
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    return redisClient;
};
exports.getRedisClient = getRedisClient;
const disconnectRedis = async () => {
    try {
        if (redisClient) {
            await redisClient.quit();
        }
    }
    catch (error) {
        logger_1.logger.error('Error disconnecting Redis:', error);
        throw error;
    }
};
exports.disconnectRedis = disconnectRedis;
const checkRedisHealth = async () => {
    try {
        if (!redisClient)
            return false;
        const result = await redisClient.ping();
        return result === 'PONG';
    }
    catch (error) {
        logger_1.logger.error('Redis health check failed:', error);
        return false;
    }
};
exports.checkRedisHealth = checkRedisHealth;
const setCache = async (key, value, ttl = 3600) => {
    try {
        await redisClient.setEx(key, ttl, JSON.stringify(value));
    }
    catch (error) {
        logger_1.logger.error('Cache set error:', error);
    }
};
exports.setCache = setCache;
const getCache = async (key) => {
    try {
        const value = await redisClient.get(key);
        return value ? JSON.parse(value) : null;
    }
    catch (error) {
        logger_1.logger.error('Cache get error:', error);
        return null;
    }
};
exports.getCache = getCache;
const deleteCache = async (key) => {
    try {
        await redisClient.del(key);
    }
    catch (error) {
        logger_1.logger.error('Cache delete error:', error);
    }
};
exports.deleteCache = deleteCache;
//# sourceMappingURL=redis.js.map