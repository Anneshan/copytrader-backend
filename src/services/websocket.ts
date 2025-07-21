import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
// Import prisma client from database configuration
import prisma from '../config/database';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/auth';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  timestamp?: string;
}

const clients = new Map<string, AuthenticatedWebSocket>();

export const setupWebSocket = (wss: WebSocketServer): void => {
  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    logger.info('New WebSocket connection');

    // Set up ping/pong for connection health
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle authentication
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString()) as WebSocketMessage;

        if (data.type === 'auth') {
          await handleAuthentication(ws, data.data?.token);
        } else if (data.type === 'subscribe') {
          await handleSubscription(ws, data.data);
        } else if (data.type === 'unsubscribe') {
          await handleUnsubscription(ws, data.data);
        } else if (data.type === 'ping') {
          sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
        }
      } catch (error) {
        logger.error('WebSocket message error:', error);
        sendMessage(ws, {
          type: 'error',
          data: { message: 'Invalid message format' },
        });
      }
    });

    // Handle connection close
    ws.on('close', () => {
      if (ws.userId) {
        clients.delete(ws.userId);
        logger.info(`WebSocket client disconnected: ${ws.userId}`);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });

    // Send welcome message
    sendMessage(ws, {
      type: 'welcome',
      data: { message: 'Connected to CopyTrader Pro WebSocket' },
      timestamp: new Date().toISOString(),
    });
  });

  // Set up ping interval to check connection health
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (!ws.isAlive) {
        logger.info('Terminating inactive WebSocket connection');
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // 30 seconds

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  logger.info('WebSocket server initialized');
};

const handleAuthentication = async (ws: AuthenticatedWebSocket, token: string): Promise<void> => {
  try {
    if (!token) {
      throw new Error('Token required');
    }

    // Verify JWT token
    const decoded = verifyToken(token, process.env.JWT_SECRET!);

    // Check if session exists and is active
    const session = await prisma.userSession.findFirst({
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

    // Store authenticated connection
    ws.userId = session.user.id;
    clients.set(session.user.id, ws);

    logger.info(`WebSocket client authenticated: ${session.user.email}`);

    sendMessage(ws, {
      type: 'auth_success',
      data: { userId: session.user.id },
      timestamp: new Date().toISOString(),
    });

    // Send initial data
    await sendInitialData(ws, session.user.id);
  } catch (error) {
    logger.error('WebSocket authentication error:', error);
    sendMessage(ws, {
      type: 'auth_error',
      data: { message: 'Authentication failed' },
    });
  }
};

const handleSubscription = async (ws: AuthenticatedWebSocket, data: any): Promise<void> => {
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

  // Store subscription preferences (in a real app, you might store this in Redis)
  logger.info(`User ${ws.userId} subscribed to channels: ${channels.join(', ')}`);

  sendMessage(ws, {
    type: 'subscription_success',
    data: { channels },
    timestamp: new Date().toISOString(),
  });
};

const handleUnsubscription = async (ws: AuthenticatedWebSocket, data: any): Promise<void> => {
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

  logger.info(`User ${ws.userId} unsubscribed from channels: ${channels.join(', ')}`);

  sendMessage(ws, {
    type: 'unsubscription_success',
    data: { channels },
    timestamp: new Date().toISOString(),
  });
};

const sendInitialData = async (ws: AuthenticatedWebSocket, userId: string): Promise<void> => {
  try {
    // Get user's accounts
    const accounts = await prisma.brokerAccount.findMany({
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

    // Get recent trades
    const recentTrades = await prisma.trade.findMany({
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
  } catch (error) {
    logger.error('Error sending initial data:', error);
  }
};

const sendMessage = (ws: WebSocket, message: WebSocketMessage): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

// Broadcast functions
export const broadcastToUser = (userId: string, message: WebSocketMessage): void => {
  const client = clients.get(userId);
  if (client) {
    sendMessage(client, message);
  }
};

export const broadcastToAll = (message: WebSocketMessage): void => {
  clients.forEach((client) => {
    sendMessage(client, message);
  });
};

export const broadcastTradeUpdate = (trade: any): void => {
  broadcastToUser(trade.userId, {
    type: 'trade_update',
    data: trade,
    timestamp: new Date().toISOString(),
  });
};

export const broadcastAccountUpdate = (account: any): void => {
  broadcastToUser(account.userId, {
    type: 'account_update',
    data: account,
    timestamp: new Date().toISOString(),
  });
};

export const broadcastMarketData = (marketData: any): void => {
  broadcastToAll({
    type: 'market_data',
    data: marketData,
    timestamp: new Date().toISOString(),
  });
};