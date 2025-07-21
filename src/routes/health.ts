import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { logger } from '../utils/logger';

const router = express.Router();

// Basic health check
router.get('/', asyncHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  
  const checks = {
    database: await checkDatabaseHealth(),
    redis: await checkRedisHealth(),
    memory: checkMemoryUsage(),
    uptime: process.uptime(),
  };

  const allHealthy = Object.values(checks).every(check => 
    typeof check === 'boolean' ? check : true
  );

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

  // Log health check
  logger.info('Health check performed', healthStatus);

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    data: healthStatus,
  });
}));

// Detailed health check
router.get('/detailed', asyncHandler(async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  
  const checks = {
    database: {
      status: await checkDatabaseHealth(),
      responseTime: await measureDatabaseResponseTime(),
    },
    redis: {
      status: await checkRedisHealth(),
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

// Readiness check (for Kubernetes)
router.get('/ready', asyncHandler(async (req: express.Request, res: express.Response) => {
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();
  
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

// Liveness check (for Kubernetes)
router.get('/live', asyncHandler(async (req: express.Request, res: express.Response) => {
  res.json({
    success: true,
    data: {
      alive: true,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
}));

// Helper functions
function checkMemoryUsage(): { usage: number; limit: number; percentage: number } {
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
  // This is a simplified version - in production, you might want to use a library
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

async function measureDatabaseResponseTime(): Promise<number> {
  const start = Date.now();
  try {
    await checkDatabaseHealth();
    return Date.now() - start;
  } catch (error) {
    return -1;
  }
}

async function measureRedisResponseTime(): Promise<number> {
  const start = Date.now();
  try {
    await checkRedisHealth();
    return Date.now() - start;
  } catch (error) {
    return -1;
  }
}

export default router;