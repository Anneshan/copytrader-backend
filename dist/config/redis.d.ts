import { RedisClientType } from 'redis';
export declare const connectRedis: () => Promise<void>;
export declare const getRedisClient: () => RedisClientType;
export declare const disconnectRedis: () => Promise<void>;
export declare const checkRedisHealth: () => Promise<boolean>;
export declare const setCache: (key: string, value: any, ttl?: number) => Promise<void>;
export declare const getCache: (key: string) => Promise<any>;
export declare const deleteCache: (key: string) => Promise<void>;
//# sourceMappingURL=redis.d.ts.map