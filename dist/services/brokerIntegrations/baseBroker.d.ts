import { EventEmitter } from 'events';
export interface BrokerCredentials {
    apiKey: string;
    apiSecret: string;
    passphrase?: string;
    sandbox?: boolean;
}
export interface TradeOrder {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    quantity: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
}
export interface TradeResult {
    orderId: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    status: 'pending' | 'filled' | 'cancelled' | 'rejected';
    timestamp: Date;
    fees?: number;
}
export interface AccountBalance {
    asset: string;
    free: number;
    locked: number;
    total: number;
}
export interface Position {
    symbol: string;
    side: 'long' | 'short';
    size: number;
    entryPrice: number;
    markPrice: number;
    pnl: number;
    percentage: number;
}
export interface MarketData {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    timestamp: Date;
}
export declare abstract class BaseBroker extends EventEmitter {
    protected credentials: BrokerCredentials;
    protected isConnected: boolean;
    protected rateLimiter: Map<string, number>;
    constructor(credentials: BrokerCredentials);
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract validateCredentials(): Promise<boolean>;
    abstract getAccountBalance(): Promise<AccountBalance[]>;
    abstract getPositions(): Promise<Position[]>;
    abstract placeOrder(order: TradeOrder): Promise<TradeResult>;
    abstract cancelOrder(orderId: string, symbol: string): Promise<boolean>;
    abstract getOrderStatus(orderId: string, symbol: string): Promise<TradeResult>;
    abstract subscribeToMarketData(symbols: string[]): Promise<void>;
    abstract unsubscribeFromMarketData(symbols: string[]): Promise<void>;
    protected checkRateLimit(endpoint: string, limit: number, windowMs: number): boolean;
    protected handleError(error: any, context: string): Error;
    healthCheck(): Promise<boolean>;
    getConnectionStatus(): boolean;
}
//# sourceMappingURL=baseBroker.d.ts.map