export declare const startHealthMonitoring: () => void;
export declare const getHealthHistory: (service?: string, hours?: number) => Promise<{
    id: string;
    status: import(".prisma/client").$Enums.HealthStatus;
    message: string | null;
    service: string;
    responseTime: number | null;
    checkedAt: Date;
}[]>;
export declare const getServiceAvailability: (service: string, hours?: number) => Promise<{
    availability: number;
    totalChecks: number;
    healthyChecks: number;
}>;
//# sourceMappingURL=healthMonitor.d.ts.map