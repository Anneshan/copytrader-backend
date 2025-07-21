import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<{
    datasources: {
        db: {
            url: string;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare const connectDatabase: () => Promise<PrismaClient<{
    datasources: {
        db: {
            url: string;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>>;
export declare const checkDatabaseHealth: () => Promise<{
    status: string;
    message: string;
    error?: undefined;
} | {
    status: string;
    message: string;
    error: unknown;
}>;
export default prisma;
//# sourceMappingURL=database.d.ts.map