"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServiceAvailability = exports.getHealthHistory = exports.startHealthMonitoring = void 0;
const database_1 = __importDefault(require("../config/database"));
const database_2 = require("../config/database");
const redis_1 = require("../config/redis");
const logger_1 = require("../utils/logger");
const startHealthMonitoring = () => {
    const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000');
    setInterval(async () => {
        await performHealthChecks();
    }, interval);
    logger_1.logger.info(`Health monitoring started with ${interval}ms interval`);
};
exports.startHealthMonitoring = startHealthMonitoring;
const performHealthChecks = async () => {
    const checks = [];
    const dbStart = Date.now();
    const dbHealth = await (0, database_2.checkDatabaseHealth)();
    const dbHealthy = dbHealth.status === 'healthy';
    checks.push({
        service: 'database',
        status: dbHealthy ? 'HEALTHY' : 'UNHEALTHY',
        responseTime: Date.now() - dbStart,
        message: dbHealthy ? 'Database connection OK' : 'Database connection failed',
    });
    const redisStart = Date.now();
    const redisHealthy = await (0, redis_1.checkRedisHealth)();
    checks.push({
        service: 'redis',
        status: redisHealthy ? 'HEALTHY' : 'UNHEALTHY',
        responseTime: Date.now() - redisStart,
        message: redisHealthy ? 'Redis connection OK' : 'Redis connection failed',
    });
    const memoryCheck = checkMemoryHealth();
    checks.push(memoryCheck);
    const cpuCheck = checkCpuHealth();
    checks.push(cpuCheck);
    await storeHealthChecks(checks);
    const criticalIssues = checks.filter(check => check.status === 'UNHEALTHY');
    if (criticalIssues.length > 0) {
        logger_1.logger.error('Critical health issues detected:', criticalIssues);
    }
    const degradedServices = checks.filter(check => check.status === 'DEGRADED');
    if (degradedServices.length > 0) {
        logger_1.logger.warn('Degraded services detected:', degradedServices);
    }
};
const checkMemoryHealth = () => {
    const usage = process.memoryUsage();
    const usedMemory = usage.heapUsed;
    const totalMemory = usage.heapTotal;
    const percentage = (usedMemory / totalMemory) * 100;
    let status = 'HEALTHY';
    let message = `Memory usage: ${percentage.toFixed(2)}%`;
    if (percentage > 90) {
        status = 'UNHEALTHY';
        message += ' - Critical memory usage';
    }
    else if (percentage > 75) {
        status = 'DEGRADED';
        message += ' - High memory usage';
    }
    return {
        service: 'memory',
        status,
        message,
        responseTime: Math.round(percentage),
    };
};
const checkCpuHealth = () => {
    const usage = process.cpuUsage();
    const totalUsage = usage.user + usage.system;
    let status = 'HEALTHY';
    let message = 'CPU usage within normal range';
    if (totalUsage > 1000000) {
        status = 'DEGRADED';
        message = 'Elevated CPU usage detected';
    }
    return {
        service: 'cpu',
        status,
        message,
        responseTime: Math.round(totalUsage / 1000),
    };
};
const storeHealthChecks = async (checks) => {
    try {
        const healthRecords = checks.map(check => ({
            service: check.service,
            status: check.status,
            message: check.message,
            responseTime: check.responseTime,
        }));
        await database_1.default.systemHealth.createMany({
            data: healthRecords,
        });
        for (const check of checks) {
            const oldRecords = await database_1.default.systemHealth.findMany({
                where: { service: check.service },
                orderBy: { checkedAt: 'desc' },
                skip: 1000,
                select: { id: true },
            });
            if (oldRecords.length > 0) {
                await database_1.default.systemHealth.deleteMany({
                    where: {
                        id: {
                            in: oldRecords.map((record) => record.id),
                        },
                    },
                });
            }
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to store health check results:', error);
    }
};
const getHealthHistory = async (service, hours = 24) => {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const where = {
        checkedAt: {
            gte: since,
        },
    };
    if (service) {
        where.service = service;
    }
    return database_1.default.systemHealth.findMany({
        where,
        orderBy: { checkedAt: 'desc' },
    });
};
exports.getHealthHistory = getHealthHistory;
const getServiceAvailability = async (service, hours = 24) => {
    const history = await (0, exports.getHealthHistory)(service, hours);
    if (history.length === 0) {
        return { availability: 0, totalChecks: 0, healthyChecks: 0 };
    }
    const healthyChecks = history.filter((check) => check.status === 'HEALTHY').length;
    const availability = (healthyChecks / history.length) * 100;
    return {
        availability: Math.round(availability * 100) / 100,
        totalChecks: history.length,
        healthyChecks,
    };
};
exports.getServiceAvailability = getServiceAvailability;
//# sourceMappingURL=healthMonitor.js.map