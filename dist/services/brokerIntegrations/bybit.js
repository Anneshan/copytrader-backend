"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitBroker = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = __importDefault(require("ws"));
const baseBroker_1 = require("./baseBroker");
const logger_1 = require("../../utils/logger");
class BybitBroker extends baseBroker_1.BaseBroker {
    constructor(credentials) {
        super(credentials);
        this.wsClient = null;
        this.baseURL = 'https://api.bybit.com';
        this.wsURL = 'wss://stream.bybit.com/v5/public/linear';
        this.apiClient = axios_1.default.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        this.apiClient.interceptors.request.use((config) => {
            const timestamp = Date.now().toString();
            const recvWindow = '5000';
            let params = '';
            if (config.method?.toLowerCase() === 'get' && config.params) {
                params = new URLSearchParams(config.params).toString();
            }
            else if (config.data) {
                params = JSON.stringify(config.data);
            }
            const message = timestamp + this.credentials.apiKey + recvWindow + params;
            const signature = crypto_1.default
                .createHmac('sha256', this.credentials.apiSecret)
                .update(message)
                .digest('hex');
            if (config.headers) {
                config.headers['X-BAPI-API-KEY'] = this.credentials.apiKey;
                config.headers['X-BAPI-TIMESTAMP'] = timestamp;
                config.headers['X-BAPI-RECV-WINDOW'] = recvWindow;
                config.headers['X-BAPI-SIGN'] = signature;
            }
            return config;
        });
        this.apiClient.interceptors.response.use((response) => response, (error) => {
            throw this.handleError(error, 'Bybit API');
        });
    }
    async connect() {
        try {
            await this.validateCredentials();
            await this.connectWebSocket();
            this.isConnected = true;
            logger_1.logger.info('Connected to Bybit');
        }
        catch (error) {
            throw this.handleError(error, 'Bybit connection');
        }
    }
    async disconnect() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
        this.isConnected = false;
        logger_1.logger.info('Disconnected from Bybit');
    }
    async validateCredentials() {
        try {
            if (!this.checkRateLimit('validate', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/v5/account/info');
            return response.data.retCode === 0;
        }
        catch (error) {
            logger_1.logger.error('Bybit credential validation failed:', error);
            return false;
        }
    }
    async getAccountBalance() {
        try {
            if (!this.checkRateLimit('balance', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/v5/account/wallet-balance', {
                params: { accountType: 'UNIFIED' }
            });
            if (response.data.retCode !== 0) {
                throw new Error('Failed to fetch balance');
            }
            const balances = [];
            response.data.result.list.forEach((account) => {
                account.coin.forEach((coin) => {
                    if (parseFloat(coin.walletBalance) > 0) {
                        balances.push({
                            asset: coin.coin,
                            free: parseFloat(coin.availableToWithdraw),
                            locked: parseFloat(coin.walletBalance) - parseFloat(coin.availableToWithdraw),
                            total: parseFloat(coin.walletBalance),
                        });
                    }
                });
            });
            return balances;
        }
        catch (error) {
            throw this.handleError(error, 'Bybit get balance');
        }
    }
    async getPositions() {
        try {
            if (!this.checkRateLimit('positions', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/v5/position/list', {
                params: { category: 'linear' }
            });
            if (response.data.retCode !== 0) {
                throw new Error('Failed to fetch positions');
            }
            return response.data.result.list
                .filter((pos) => parseFloat(pos.size) !== 0)
                .map((position) => ({
                symbol: position.symbol,
                side: position.side.toLowerCase(),
                size: parseFloat(position.size),
                entryPrice: parseFloat(position.avgPrice),
                markPrice: parseFloat(position.markPrice),
                pnl: parseFloat(position.unrealisedPnl),
                percentage: parseFloat(position.unrealisedPnl) / parseFloat(position.positionValue) * 100,
            }));
        }
        catch (error) {
            throw this.handleError(error, 'Bybit get positions');
        }
    }
    async placeOrder(order) {
        try {
            if (!this.checkRateLimit('order', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const orderData = {
                category: 'linear',
                symbol: order.symbol,
                side: order.side === 'buy' ? 'Buy' : 'Sell',
                orderType: order.type === 'market' ? 'Market' : 'Limit',
                qty: order.quantity.toString(),
                timeInForce: order.timeInForce || 'GTC',
            };
            if (order.price) {
                orderData.price = order.price.toString();
            }
            if (order.stopPrice) {
                orderData.stopLoss = order.stopPrice.toString();
            }
            const response = await this.apiClient.post('/v5/order/create', orderData);
            if (response.data.retCode !== 0) {
                throw new Error(response.data.retMsg || 'Order placement failed');
            }
            const result = response.data.result;
            return {
                orderId: result.orderId,
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                price: order.price || 0,
                status: 'pending',
                timestamp: new Date(),
                fees: 0,
            };
        }
        catch (error) {
            throw this.handleError(error, 'Bybit place order');
        }
    }
    async cancelOrder(orderId, symbol) {
        try {
            if (!this.checkRateLimit('cancel', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.post('/v5/order/cancel', {
                category: 'linear',
                symbol: symbol,
                orderId: orderId,
            });
            return response.data.retCode === 0;
        }
        catch (error) {
            throw this.handleError(error, 'Bybit cancel order');
        }
    }
    async getOrderStatus(orderId, symbol) {
        try {
            if (!this.checkRateLimit('order_status', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/v5/order/realtime', {
                params: {
                    category: 'linear',
                    symbol: symbol,
                    orderId: orderId,
                },
            });
            if (response.data.retCode !== 0) {
                throw new Error('Failed to fetch order status');
            }
            const order = response.data.result.list[0];
            return {
                orderId: order.orderId,
                symbol: order.symbol,
                side: order.side.toLowerCase(),
                quantity: parseFloat(order.qty),
                price: parseFloat(order.price || order.avgPrice || '0'),
                status: this.mapOrderStatus(order.orderStatus),
                timestamp: new Date(parseInt(order.updatedTime)),
                fees: parseFloat(order.cumExecFee || '0'),
            };
        }
        catch (error) {
            throw this.handleError(error, 'Bybit get order status');
        }
    }
    async subscribeToMarketData(symbols) {
        if (!this.wsClient || this.wsClient.readyState !== ws_1.default.OPEN) {
            await this.connectWebSocket();
        }
        const subscribeMessage = {
            op: 'subscribe',
            args: symbols.map(symbol => `tickers.${symbol}`),
        };
        this.wsClient?.send(JSON.stringify(subscribeMessage));
        logger_1.logger.info(`Subscribed to market data for: ${symbols.join(', ')}`);
    }
    async unsubscribeFromMarketData(symbols) {
        if (!this.wsClient || this.wsClient.readyState !== ws_1.default.OPEN) {
            return;
        }
        const unsubscribeMessage = {
            op: 'unsubscribe',
            args: symbols.map(symbol => `tickers.${symbol}`),
        };
        this.wsClient?.send(JSON.stringify(unsubscribeMessage));
        logger_1.logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
    }
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.wsClient = new ws_1.default(this.wsURL);
            this.wsClient.on('open', () => {
                logger_1.logger.info('Bybit WebSocket connected');
                resolve();
            });
            this.wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleWebSocketMessage(message);
                }
                catch (error) {
                    logger_1.logger.error('Error parsing WebSocket message:', error);
                }
            });
            this.wsClient.on('error', (error) => {
                logger_1.logger.error('Bybit WebSocket error:', error);
                reject(error);
            });
            this.wsClient.on('close', () => {
                logger_1.logger.info('Bybit WebSocket disconnected');
                this.wsClient = null;
            });
        });
    }
    handleWebSocketMessage(message) {
        if (message.topic && message.topic.startsWith('tickers.') && message.data) {
            const marketData = {
                symbol: message.data.symbol,
                price: parseFloat(message.data.lastPrice),
                change24h: parseFloat(message.data.price24hPcnt) * 100,
                volume24h: parseFloat(message.data.volume24h),
                timestamp: new Date(parseInt(message.ts)),
            };
            this.emit('marketData', marketData);
        }
    }
    mapOrderStatus(status) {
        switch (status) {
            case 'New':
            case 'PartiallyFilled':
                return 'pending';
            case 'Filled':
                return 'filled';
            case 'Cancelled':
            case 'Rejected':
                return 'cancelled';
            case 'Deactivated':
                return 'rejected';
            default:
                return 'pending';
        }
    }
}
exports.BybitBroker = BybitBroker;
//# sourceMappingURL=bybit.js.map