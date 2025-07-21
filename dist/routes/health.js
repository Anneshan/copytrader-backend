"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const errorHandler_1 = require("../middleware/errorHandler");
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    const checks = {
        database: await (0, database_1.checkDatabaseHealth)(),
        redis: await (0, redis_1.checkRedisHealth)(),
        memory: checkMemoryUsage(),
        uptime: process.uptime(),
    };
    const allHealthy = Object.values(checks).every(check => typeof check === 'boolean' ? check : true);
    const responseTime = Date.now() - startTime;
    const healthStatus = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        checks,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
    };
    logger_1.logger.info('Health check performed', healthStatus);
    res.status(allHealthy ? 200 : 503).json({
        success: allHealthy,
        data: healthStatus,
    });
}));
router.get('/detailed', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const startTime = Date.now();
    const checks = {
        database: {
            status: await (0, database_1.checkDatabaseHealth)(),
            responseTime: await measureDatabaseResponseTime(),
        },
        redis: {
            status: await (0, redis_1.checkRedisHealth)(),
            responseTime: await measureRedisResponseTime(),
        },
        memory: getDetailedMemoryUsage(),
        disk: getDiskUsage(),
        cpu: getCpuUsage(),
        network: getNetworkInfo(),
    };
    const allHealthy = checks.database.status && checks.redis.status;
    const responseTime = Date.now() - startTime;
    const healthStatus = {
        status: allHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        checks,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
    };
    res.status(allHealthy ? 200 : 503).json({
        success: allHealthy,
        data: healthStatus,
    });
}));
router.get('/ready', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const dbHealthy = await (0, database_1.checkDatabaseHealth)();
    const redisHealthy = await (0, redis_1.checkRedisHealth)();
    const ready = dbHealthy && redisHealthy;
    res.status(ready ? 200 : 503).json({
        success: ready,
        data: {
            ready,
            database: dbHealthy,
            redis: redisHealthy,
        },
    });
}));
router.get('/live', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    res.json({
        success: true,
        data: {
            alive: true,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        },
    });
}));
function checkMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal;
    const usedMemory = usage.heapUsed;
    const percentage = (usedMemory / totalMemory) * 100;
    return {
        usage: usedMemory,
        limit: totalMemory,
        percentage: Math.round(percentage * 100) / 100,
    };
}
function getDetailedMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers,
    };
}
function getDiskUsage() {
    return {
        available: 'N/A',
        used: 'N/A',
        total: 'N/A',
    };
}
function getCpuUsage() {
    const usage = process.cpuUsage();
    return {
        user: usage.user,
        system: usage.system,
    };
}
function getNetworkInfo() {
    return {
        hostname: require('os').hostname(),
        platform: process.platform,
        arch: process.arch,
    };
}
async function measureDatabaseResponseTime() {
    const start = Date.now();
    try {
        await (0, database_1.checkDatabaseHealth)();
        return Date.now() - start;
    }
    catch (error) {
        return -1;
    }
}
async function measureRedisResponseTime() {
    const start = Date.now();
    try {
        await (0, redis_1.checkRedisHealth)();
        return Date.now() - start;
    }
    catch (error) {
        return -1;
    }
}
exports.default = router;
//# sourceMappingURL=health.js.map