// Import prisma client from database configuration
import prisma from '../config/database';
import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { logger } from '../utils/logger';

interface HealthCheck {
  service: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  message?: string;
  responseTime?: number;
}

export const startHealthMonitoring = (): void => {
  const interval = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000');
  
  setInterval(async () => {
    await performHealthChecks();
  }, interval);

  logger.info(`Health monitoring started with ${interval}ms interval`);
};

const performHealthChecks = async (): Promise<void> => {
  const checks: HealthCheck[] = [];

  // Database health check
  const dbStart = Date.now();
  const dbHealth = await checkDatabaseHealth();
  const dbHealthy = dbHealth.status === 'healthy';
  checks.push({
    service: 'database',
    status: dbHealthy ? 'HEALTHY' : 'UNHEALTHY',
    responseTime: Date.now() - dbStart,
    message: dbHealthy ? 'Database connection OK' : 'Database connection failed',
  });

  // Redis health check
  const redisStart = Date.now();
  const redisHealthy = await checkRedisHealth();
  checks.push({
    service: 'redis',
    status: redisHealthy ? 'HEALTHY' : 'UNHEALTHY',
    responseTime: Date.now() - redisStart,
    message: redisHealthy ? 'Redis connection OK' : 'Redis connection failed',
  });

  // Memory health check
  const memoryCheck = checkMemoryHealth();
  checks.push(memoryCheck);

  // CPU health check
  const cpuCheck = checkCpuHealth();
  checks.push(cpuCheck);

  // Store health check results
  await storeHealthChecks(checks);

  // Log critical issues
  const criticalIssues = checks.filter(check => check.status === 'UNHEALTHY');
  if (criticalIssues.length > 0) {
    logger.error('Critical health issues detected:', criticalIssues);
  }

  // Log degraded services
  const degradedServices = checks.filter(check => check.status === 'DEGRADED');
  if (degradedServices.length > 0) {
    logger.warn('Degraded services detected:', degradedServices);
  }
};

const checkMemoryHealth = (): HealthCheck => {
  const usage = process.memoryUsage();
  const usedMemory = usage.heapUsed;
  const totalMemory = usage.heapTotal;
  const percentage = (usedMemory / totalMemory) * 100;

  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  let message = `Memory usage: ${percentage.toFixed(2)}%`;

  if (percentage > 90) {
    status = 'UNHEALTHY';
    message += ' - Critical memory usage';
  } else if (percentage > 75) {
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

const checkCpuHealth = (): HealthCheck => {
  const usage = process.cpuUsage();
  const totalUsage = usage.user + usage.system;
  
  // This is a simplified CPU check - in production, you might want more sophisticated monitoring
  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
  let message = 'CPU usage within normal range';

  // For demonstration purposes, we'll consider high CPU usage based on process CPU time
  if (totalUsage > 1000000) { // 1 second of CPU time
    status = 'DEGRADED';
    message = 'Elevated CPU usage detected';
  }

  return {
    service: 'cpu',
    status,
    message,
    responseTime: Math.round(totalUsage / 1000), // Convert to milliseconds
  };
};

const storeHealthChecks = async (checks: HealthCheck[]): Promise<void> => {
  try {
    const healthRecords = checks.map(check => ({
      service: check.service,
      status: check.status,
      message: check.message,
      responseTime: check.responseTime,
    }));

    await prisma.systemHealth.createMany({
      data: healthRecords,
    });

    // Clean up old health records (keep only last 1000 records per service)
    for (const check of checks) {
      const oldRecords = await prisma.systemHealth.findMany({
        where: { service: check.service },
        orderBy: { checkedAt: 'desc' },
        skip: 1000,
        select: { id: true },
      });

      if (oldRecords.length > 0) {
        await prisma.systemHealth.deleteMany({
          where: {
            id: {
              in: oldRecords.map((record: { id: string }) => record.id),
            },
          },
        });
      }
    }
  } catch (error) {
    logger.error('Failed to store health check results:', error);
  }
};

export const getHealthHistory = async (service?: string, hours: number = 24) => {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where: any = {
    checkedAt: {
      gte: since,
    },
  };

  if (service) {
    where.service = service;
  }

  return prisma.systemHealth.findMany({
    where,
    orderBy: { checkedAt: 'desc' },
  });
};

export const getServiceAvailability = async (service: string, hours: number = 24) => {
  const history = await getHealthHistory(service, hours);
  
  if (history.length === 0) {
    return { availability: 0, totalChecks: 0, healthyChecks: 0 };
  }

  const healthyChecks = history.filter((check: { status: string }) => check.status === 'HEALTHY').length;
  const availability = (healthyChecks / history.length) * 100;

  return {
    availability: Math.round(availability * 100) / 100,
    totalChecks: history.length,
    healthyChecks,
  };
};