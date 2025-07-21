"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceFuturesBroker = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = __importDefault(require("ws"));
const baseBroker_1 = require("./baseBroker");
const logger_1 = require("../../utils/logger");
class BinanceFuturesBroker extends baseBroker_1.BaseBroker {
    constructor(credentials) {
        super(credentials);
        this.wsClient = null;
        this.baseURL = 'https://fapi.binance.com';
        this.wsURL = 'wss://fstream.binance.com/ws';
        this.apiClient = axios_1.default.create({
            baseURL: this.baseURL,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'X-MBX-APIKEY': this.credentials.apiKey,
            },
        });
        this.setupInterceptors();
    }
    setupInterceptors() {
        this.apiClient.interceptors.request.use((config) => {
            if (config.url?.includes('/fapi/v1/') || config.url?.includes('/fapi/v2/')) {
                const timestamp = Date.now();
                const params = new URLSearchParams(config.params);
                params.append('timestamp', timestamp.toString());
                const signature = crypto_1.default
                    .createHmac('sha256', this.credentials.apiSecret)
                    .update(params.toString())
                    .digest('hex');
                params.append('signature', signature);
                config.params = Object.fromEntries(params);
            }
            return config;
        });
        this.apiClient.interceptors.response.use((response) => response, (error) => {
            throw this.handleError(error, 'Binance Futures API');
        });
    }
    async connect() {
        try {
            await this.validateCredentials();
            await this.connectWebSocket();
            this.isConnected = true;
            logger_1.logger.info('Connected to Binance Futures');
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures connection');
        }
    }
    async disconnect() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }
        this.isConnected = false;
        logger_1.logger.info('Disconnected from Binance Futures');
    }
    async validateCredentials() {
        try {
            if (!this.checkRateLimit('validate', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/fapi/v2/account');
            return response.status === 200 && response.data.canTrade;
        }
        catch (error) {
            logger_1.logger.error('Binance Futures credential validation failed:', error);
            return false;
        }
    }
    async getAccountBalance() {
        try {
            if (!this.checkRateLimit('balance', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/fapi/v2/balance');
            return response.data
                .filter((balance) => parseFloat(balance.balance) > 0)
                .map((balance) => ({
                asset: balance.asset,
                free: parseFloat(balance.availableBalance),
                locked: parseFloat(balance.balance) - parseFloat(balance.availableBalance),
                total: parseFloat(balance.balance),
            }));
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures get balance');
        }
    }
    async getPositions() {
        try {
            if (!this.checkRateLimit('positions', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/fapi/v2/positionRisk');
            return response.data
                .filter((pos) => parseFloat(pos.positionAmt) !== 0)
                .map((position) => ({
                symbol: position.symbol,
                side: parseFloat(position.positionAmt) > 0 ? 'long' : 'short',
                size: Math.abs(parseFloat(position.positionAmt)),
                entryPrice: parseFloat(position.entryPrice),
                markPrice: parseFloat(position.markPrice),
                pnl: parseFloat(position.unRealizedProfit),
                percentage: parseFloat(position.percentage),
            }));
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures get positions');
        }
    }
    async placeOrder(order) {
        try {
            if (!this.checkRateLimit('order', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const orderData = {
                symbol: order.symbol,
                side: order.side.toUpperCase(),
                type: order.type.toUpperCase(),
                quantity: order.quantity.toString(),
                timeInForce: order.timeInForce || 'GTC',
            };
            if (order.price) {
                orderData.price = order.price.toString();
            }
            if (order.stopPrice) {
                orderData.stopPrice = order.stopPrice.toString();
            }
            const response = await this.apiClient.post('/fapi/v1/order', orderData);
            return {
                orderId: response.data.orderId.toString(),
                symbol: response.data.symbol,
                side: response.data.side.toLowerCase(),
                quantity: parseFloat(response.data.origQty),
                price: parseFloat(response.data.price || response.data.avgPrice || '0'),
                status: this.mapOrderStatus(response.data.status),
                timestamp: new Date(response.data.updateTime),
                fees: 0,
            };
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures place order');
        }
    }
    async cancelOrder(orderId, symbol) {
        try {
            if (!this.checkRateLimit('cancel', 20, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.delete('/fapi/v1/order', {
                params: {
                    symbol: symbol,
                    orderId: orderId,
                },
            });
            return response.data.status === 'CANCELED';
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures cancel order');
        }
    }
    async getOrderStatus(orderId, symbol) {
        try {
            if (!this.checkRateLimit('order_status', 10, 60000)) {
                throw new Error('Rate limit exceeded');
            }
            const response = await this.apiClient.get('/fapi/v1/order', {
                params: {
                    symbol: symbol,
                    orderId: orderId,
                },
            });
            const order = response.data;
            return {
                orderId: order.orderId.toString(),
                symbol: order.symbol,
                side: order.side.toLowerCase(),
                quantity: parseFloat(order.origQty),
                price: parseFloat(order.price || order.avgPrice || '0'),
                status: this.mapOrderStatus(order.status),
                timestamp: new Date(order.updateTime),
                fees: parseFloat(order.commission || '0'),
            };
        }
        catch (error) {
            throw this.handleError(error, 'Binance Futures get order status');
        }
    }
    async subscribeToMarketData(symbols) {
        if (!this.wsClient || this.wsClient.readyState !== ws_1.default.OPEN) {
            await this.connectWebSocket();
        }
        const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
        const subscribeMessage = {
            method: 'SUBSCRIBE',
            params: streams,
            id: Date.now(),
        };
        this.wsClient?.send(JSON.stringify(subscribeMessage));
        logger_1.logger.info(`Subscribed to market data for: ${symbols.join(', ')}`);
    }
    async unsubscribeFromMarketData(symbols) {
        if (!this.wsClient || this.wsClient.readyState !== ws_1.default.OPEN) {
            return;
        }
        const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
        const unsubscribeMessage = {
            method: 'UNSUBSCRIBE',
            params: streams,
            id: Date.now(),
        };
        this.wsClient?.send(JSON.stringify(unsubscribeMessage));
        logger_1.logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
    }
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.wsClient = new ws_1.default(this.wsURL);
            this.wsClient.on('open', () => {
                logger_1.logger.info('Binance Futures WebSocket connected');
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
                logger_1.logger.error('Binance Futures WebSocket error:', error);
                reject(error);
            });
            this.wsClient.on('close', () => {
                logger_1.logger.info('Binance Futures WebSocket disconnected');
                this.wsClient = null;
            });
        });
    }
    handleWebSocketMessage(message) {
        if (message.e === '24hrTicker') {
            const marketData = {
                symbol: message.s,
                price: parseFloat(message.c),
                change24h: parseFloat(message.P),
                volume24h: parseFloat(message.v),
                timestamp: new Date(message.E),
            };
            this.emit('marketData', marketData);
        }
    }
    mapOrderStatus(status) {
        switch (status) {
            case 'NEW':
            case 'PARTIALLY_FILLED':
                return 'pending';
            case 'FILLED':
                return 'filled';
            case 'CANCELED':
            case 'EXPIRED':
                return 'cancelled';
            case 'REJECTED':
                return 'rejected';
            default:
                return 'pending';
        }
    }
}
exports.BinanceFuturesBroker = BinanceFuturesBroker;
//# sourceMappingURL=binanceFutures.js.map