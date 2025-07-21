"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastMarketData = exports.broadcastAccountUpdate = exports.broadcastTradeUpdate = exports.broadcastToAll = exports.broadcastToUser = exports.setupWebSocket = void 0;
const ws_1 = require("ws");
const database_1 = __importDefault(require("../config/database"));
const logger_1 = require("../utils/logger");
const auth_1 = require("../utils/auth");
const clients = new Map();
const setupWebSocket = (wss) => {
    wss.on('connection', async (ws, req) => {
        logger_1.logger.info('New WebSocket connection');
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'auth') {
                    await handleAuthentication(ws, data.data?.token);
                }
                else if (data.type === 'subscribe') {
                    await handleSubscription(ws, data.data);
                }
                else if (data.type === 'unsubscribe') {
                    await handleUnsubscription(ws, data.data);
                }
                else if (data.type === 'ping') {
                    sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
                }
            }
            catch (error) {
                logger_1.logger.error('WebSocket message error:', error);
                sendMessage(ws, {
                    type: 'error',
                    data: { message: 'Invalid message format' },
                });
            }
        });
        ws.on('close', () => {
            if (ws.userId) {
                clients.delete(ws.userId);
                logger_1.logger.info(`WebSocket client disconnected: ${ws.userId}`);
            }
        });
        ws.on('error', (error) => {
            logger_1.logger.error('WebSocket error:', error);
        });
        sendMessage(ws, {
            type: 'welcome',
            data: { message: 'Connected to CopyTrader Pro WebSocket' },
            timestamp: new Date().toISOString(),
        });
    });
    const pingInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.isAlive) {
                logger_1.logger.info('Terminating inactive WebSocket connection');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);
    wss.on('close', () => {
        clearInterval(pingInterval);
    });
    logger_1.logger.info('WebSocket server initialized');
};
exports.setupWebSocket = setupWebSocket;
const handleAuthentication = async (ws, token) => {
    try {
        if (!token) {
            throw new Error('Token required');
        }
        const decoded = (0, auth_1.verifyToken)(token, process.env.JWT_SECRET);
        const session = await database_1.default.userSession.findFirst({
            where: {
                token,
                isActive: true,
                expiresAt: {
                    gt: new Date(),
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isActive: true,
                    },
                },
            },
        });
        if (!session || !session.user.isActive) {
            throw new Error('Invalid or expired token');
        }
        ws.userId = session.user.id;
        clients.set(session.user.id, ws);
        logger_1.logger.info(`WebSocket client authenticated: ${session.user.email}`);
        sendMessage(ws, {
            type: 'auth_success',
            data: { userId: session.user.id },
            timestamp: new Date().toISOString(),
        });
        await sendInitialData(ws, session.user.id);
    }
    catch (error) {
        logger_1.logger.error('WebSocket authentication error:', error);
        sendMessage(ws, {
            type: 'auth_error',
            data: { message: 'Authentication failed' },
        });
    }
};
const handleSubscription = async (ws, data) => {
    if (!ws.userId) {
        return sendMessage(ws, {
            type: 'error',
            data: { message: 'Authentication required' },
        });
    }
    const { channels } = data;
    if (!Array.isArray(channels)) {
        return sendMessage(ws, {
            type: 'error',
            data: { message: 'Invalid subscription data' },
        });
    }
    logger_1.logger.info(`User ${ws.userId} subscribed to channels: ${channels.join(', ')}`);
    sendMessage(ws, {
        type: 'subscription_success',
        data: { channels },
        timestamp: new Date().toISOString(),
    });
};
const handleUnsubscription = async (ws, data) => {
    if (!ws.userId) {
        return sendMessage(ws, {
            type: 'error',
            data: { message: 'Authentication required' },
        });
    }
    const { channels } = data;
    if (!Array.isArray(channels)) {
        return sendMessage(ws, {
            type: 'error',
            data: { message: 'Invalid unsubscription data' },
        });
    }
    logger_1.logger.info(`User ${ws.userId} unsubscribed from channels: ${channels.join(', ')}`);
    sendMessage(ws, {
        type: 'unsubscription_success',
        data: { channels },
        timestamp: new Date().toISOString(),
    });
};
const sendInitialData = async (ws, userId) => {
    try {
        const accounts = await database_1.default.brokerAccount.findMany({
            where: { userId },
            select: {
                id: true,
                name: true,
                broker: true,
                accountType: true,
                isActive: true,
                balance: true,
                pnl: true,
                lastSync: true,
            },
        });
        const recentTrades = await database_1.default.trade.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true,
                symbol: true,
                side: true,
                quantity: true,
                price: true,
                pnl: true,
                status: true,
                createdAt: true,
            },
        });
        sendMessage(ws, {
            type: 'initial_data',
            data: {
                accounts,
                recentTrades,
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.logger.error('Error sending initial data:', error);
    }
};
const sendMessage = (ws, message) => {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
};
const broadcastToUser = (userId, message) => {
    const client = clients.get(userId);
    if (client) {
        sendMessage(client, message);
    }
};
exports.broadcastToUser = broadcastToUser;
const broadcastToAll = (message) => {
    clients.forEach((client) => {
        sendMessage(client, message);
    });
};
exports.broadcastToAll = broadcastToAll;
const broadcastTradeUpdate = (trade) => {
    (0, exports.broadcastToUser)(trade.userId, {
        type: 'trade_update',
        data: trade,
        timestamp: new Date().toISOString(),
    });
};
exports.broadcastTradeUpdate = broadcastTradeUpdate;
const broadcastAccountUpdate = (account) => {
    (0, exports.broadcastToUser)(account.userId, {
        type: 'account_update',
        data: account,
        timestamp: new Date().toISOString(),
    });
};
exports.broadcastAccountUpdate = broadcastAccountUpdate;
const broadcastMarketData = (marketData) => {
    (0, exports.broadcastToAll)({
        type: 'market_data',
        data: marketData,
        timestamp: new Date().toISOString(),
    });
};
exports.broadcastMarketData = broadcastMarketData;
//# sourceMappingURL=websocket.js.map