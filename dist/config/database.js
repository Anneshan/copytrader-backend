"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDatabaseHealth = exports.connectDatabase = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/copytrader_pro',
        },
    },
});
const connectDatabase = async () => {
    try {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
        return prisma;
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
};
exports.connectDatabase = connectDatabase;
const checkDatabaseHealth = async () => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return { status: 'healthy', message: 'Database connection is working' };
    }
    catch (error) {
        return { status: 'unhealthy', message: 'Database connection failed', error };
    }
};
exports.checkDatabaseHealth = checkDatabaseHealth;
exports.default = prisma;
//# sourceMappingURL=database.js.map