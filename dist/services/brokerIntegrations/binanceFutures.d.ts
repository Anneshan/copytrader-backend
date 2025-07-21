import { BaseBroker, BrokerCredentials, TradeOrder, TradeResult, AccountBalance, Position } from './baseBroker';
export declare class BinanceFuturesBroker extends BaseBroker {
    private apiClient;
    private wsClient;
    private readonly baseURL;
    private readonly wsURL;
    constructor(credentials: BrokerCredentials);
    private setupInterceptors;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    validateCredentials(): Promise<boolean>;
    getAccountBalance(): Promise<AccountBalance[]>;
    getPositions(): Promise<Position[]>;
    placeOrder(order: TradeOrder): Promise<TradeResult>;
    cancelOrder(orderId: string, symbol: string): Promise<boolean>;
    getOrderStatus(orderId: string, symbol: string): Promise<TradeResult>;
    subscribeToMarketData(symbols: string[]): Promise<void>;
    unsubscribeFromMarketData(symbols: string[]): Promise<void>;
    private connectWebSocket;
    private handleWebSocketMessage;
    private mapOrderStatus;
}
//# sourceMappingURL=binanceFutures.d.ts.map