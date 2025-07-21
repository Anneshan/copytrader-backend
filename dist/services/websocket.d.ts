import { WebSocketServer } from 'ws';
interface WebSocketMessage {
    type: string;
    data?: any;
    timestamp?: string;
}
export declare const setupWebSocket: (wss: WebSocketServer) => void;
export declare const broadcastToUser: (userId: string, message: WebSocketMessage) => void;
export declare const broadcastToAll: (message: WebSocketMessage) => void;
export declare const broadcastTradeUpdate: (trade: any) => void;
export declare const broadcastAccountUpdate: (account: any) => void;
export declare const broadcastMarketData: (marketData: any) => void;
export {};
//# sourceMappingURL=websocket.d.ts.map