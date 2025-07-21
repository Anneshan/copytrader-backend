import { PrismaClient } from '@prisma/client';

// Initialize Prisma client with database configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/copytrader_pro',
    },
  },
});

// Connect to database function
export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    return prisma;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Health check function
export const checkDatabaseHealth = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'Database connection is working' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Database connection failed', error };
  }
};

// Export prisma client as default export
export default prisma;