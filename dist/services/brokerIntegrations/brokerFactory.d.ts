import { BaseBroker, BrokerCredentials } from './baseBroker';
export type SupportedBroker = 'DELTA' | 'BINANCE' | 'BYBIT' | 'OKX';
export declare class BrokerFactory {
    private static instances;
    static createBroker(brokerType: SupportedBroker, credentials: BrokerCredentials, instanceId?: string): BaseBroker;
    static connectBroker(brokerType: SupportedBroker, credentials: BrokerCredentials, instanceId?: string): Promise<BaseBroker>;
    static getBroker(instanceId: string): BaseBroker | undefined;
    static disconnectBroker(instanceId: string): Promise<void>;
    static disconnectAllBrokers(): Promise<void>;
    static getConnectedBrokers(): string[];
    static healthCheckAll(): Promise<Record<string, boolean>>;
    static getSupportedBrokers(): SupportedBroker[];
    static getBrokerInfo(brokerType: SupportedBroker): {
        name: string;
        baseUrl: string;
        wsUrl: string;
        features: string[];
    };
}
//# sourceMappingURL=brokerFactory.d.ts.map