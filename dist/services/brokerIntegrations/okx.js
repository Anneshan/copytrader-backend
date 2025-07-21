"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OKXBroker = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = __importDefault(require("ws"));
const baseBroker_1 = require("./baseBroker");
const logger_1 = require("../../utils/logger");
class OKXBroker extends baseBroker_1.BaseBroker {
    constructor(credentials) {
        super(credentials);
        this.wsClient = null;
        this.baseURL = 'https://www.okx.com';
        this.wsURL = 'wss://ws.okx.com:8443/ws/v5/public';
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
            const timestamp = new Date().toISOString();
            const method = config.method?.toUpperCase() || 'GET';
            const path = config.url || '';
            const body = config.data ? JSON.stringify(config.data) : '';
            const message = timestamp + method + path + body;
            const signature = crypto_1.default
                .createHmac('sha256', this.credentials.apiSecret)
                .update(message)
                .digest('base64');
            if (config.headers) {
                config.headers['OK-ACCESS-KEY'] = this.credentials.apiKey;
                config.headers['OK-ACCESS-SIGN'] = signature;
                config.headers['OK-ACCESS-TIMESTAMP'] = timestamp;
                config.headers['OK-ACCESS-PASSPHRASE'] = this.credentials.passphrase || '';
            }
            return config;
        });
        this.apiClient.interceptors.response.use((response) => response, (error) => {
            throw this.handleError(error, 'OKX API');
        });
    }
    async connect() {
        try {
            await this.validateCredentials();
            await this.connectWebSocket();
            this.isConnected = true;
            logger_1.logger.info('Connected to OKX');
        }
        catch (error) {
            throw this.handleError(error, 'OKX connection');
        }
    }
    async disconnect() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
        this.isConnected = false;
        logger_1.logger.info('Disconnected from OKX');
    }
    async validateCredentials() {
        try {
            if (!this.checkRateLimit('validate', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/api/v5/account/config');
            return response.data.code === '0';
        }
        catch (error) {
            logger_1.logger.error('OKX credential validation failed:', error);
            return false;
        }
    }
    async getAccountBalance() {
        try {
            if (!this.checkRateLimit('balance', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/api/v5/account/balance');
            if (response.data.code !== '0') {
                throw new Error('Failed to fetch balance');
            }
            const balances = [];
            response.data.data.forEach((account) => {
                account.details.forEach((detail) => {
                    if (parseFloat(detail.bal) > 0) {
                        balances.push({
                            asset: detail.ccy,
                            free: parseFloat(detail.availBal),
                            locked: parseFloat(detail.bal) - parseFloat(detail.availBal),
                            total: parseFloat(detail.bal),
                        });
                    }
                });
            });
            return balances;
        }
        catch (error) {
            throw this.handleError(error, 'OKX get balance');
        }
    }
    async getPositions() {
        try {
            if (!this.checkRateLimit('positions', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/api/v5/account/positions');
            if (response.data.code !== '0') {
                throw new Error('Failed to fetch positions');
            }
            return response.data.data
                .filter((pos) => parseFloat(pos.pos) !== 0)
                .map((position) => ({
                symbol: position.instId,
                side: position.posSide === 'long' ? 'long' : 'short',
                size: Math.abs(parseFloat(position.pos)),
                entryPrice: parseFloat(position.avgPx),
                markPrice: parseFloat(position.markPx),
                pnl: parseFloat(position.upl),
                percentage: parseFloat(position.uplRatio) * 100,
            }));
        }
        catch (error) {
            throw this.handleError(error, 'OKX get positions');
        }
    }
    async placeOrder(order) {
        try {
            if (!this.checkRateLimit('order', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const orderData = {
                instId: order.symbol,
                tdMode: 'cross',
                side: order.side,
                ordType: order.type,
                sz: order.quantity.toString(),
            };
            if (order.price) {
                orderData.px = order.price.toString();
            }
            if (order.stopPrice) {
                orderData.slTriggerPx = order.stopPrice.toString();
            }
            const response = await this.apiClient.post('/api/v5/trade/order', orderData);
            if (response.data.code !== '0') {
                throw new Error(response.data.msg || 'Order placement failed');
            }
            const result = response.data.data[0];
            return {
                orderId: result.ordId,
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                price: order.price || 0,
                status: this.mapOrderStatus(result.sCode),
                timestamp: new Date(),
                fees: 0,
            };
        }
        catch (error) {
            throw this.handleError(error, 'OKX place order');
        }
    }
    async cancelOrder(orderId, symbol) {
        try {
            if (!this.checkRateLimit('cancel', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.post('/api/v5/trade/cancel-order', {
                instId: symbol,
                ordId: orderId,
            });
            return response.data.code === '0';
        }
        catch (error) {
            throw this.handleError(error, 'OKX cancel order');
        }
    }
    async getOrderStatus(orderId, symbol) {
        try {
            if (!this.checkRateLimit('order_status', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/api/v5/trade/order', {
                params: {
                    instId: symbol,
                    ordId: orderId,
                },
            });
            if (response.data.code !== '0') {
                throw new Error('Failed to fetch order status');
            }
            const order = response.data.data[0];
            return {
                orderId: order.ordId,
                symbol: order.instId,
                side: order.side,
                quantity: parseFloat(order.sz),
                price: parseFloat(order.px || order.avgPx || '0'),
                status: this.mapOrderStatus(order.state),
                timestamp: new Date(parseInt(order.uTime)),
                fees: parseFloat(order.fee || '0'),
            };
        }
        catch (error) {
            throw this.handleError(error, 'OKX get order status');
        }
    }
    async subscribeToMarketData(symbols) {
        if (!this.wsClient || this.wsClient.readyState !== ws_1.default.OPEN) {
            await this.connectWebSocket();
        }
        const subscribeMessage = {
            op: 'subscribe',
            args: symbols.map(symbol => ({
                channel: 'tickers',
                instId: symbol,
            })),
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
            args: symbols.map(symbol => ({
                channel: 'tickers',
                instId: symbol,
            })),
        };
        this.wsClient?.send(JSON.stringify(unsubscribeMessage));
        logger_1.logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
    }
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.wsClient = new ws_1.default(this.wsURL);
            this.wsClient.on('open', () => {
                logger_1.logger.info('OKX WebSocket connected');
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
                logger_1.logger.error('OKX WebSocket error:', error);
                reject(error);
            });
            this.wsClient.on('close', () => {
                logger_1.logger.info('OKX WebSocket disconnected');
                this.wsClient = null;
            });
        });
    }
    handleWebSocketMessage(message) {
        if (message.arg?.channel === 'tickers' && message.data) {
            const ticker = message.data[0];
            const marketData = {
                symbol: ticker.instId,
                price: parseFloat(ticker.last),
                change24h: parseFloat(ticker.sodUtc8),
                volume24h: parseFloat(ticker.vol24h),
                timestamp: new Date(parseInt(ticker.ts)),
            };
            this.emit('marketData', marketData);
        }
    }
    mapOrderStatus(state) {
        switch (state) {
            case 'live':
            case 'partially_filled':
                return 'pending';
            case 'filled':
                return 'filled';
            case 'canceled':
                return 'cancelled';
            case 'rejected':
                return 'rejected';
            default:
                return 'pending';
        }
    }
}
exports.OKXBroker = OKXBroker;
//# sourceMappingURL=okx.js.map