import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

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

export abstract class BaseBroker extends EventEmitter {
  protected credentials: BrokerCredentials;
  protected isConnected: boolean = false;
  protected rateLimiter: Map<string, number> = new Map();

  constructor(credentials: BrokerCredentials) {
    super();
    this.credentials = credentials;
  }

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

  // Rate limiting helper
  protected checkRateLimit(endpoint: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const key = `${endpoint}_${Math.floor(now / windowMs)}`;
    const current = this.rateLimiter.get(key) || 0;

    if (current >= limit) {
      logger.warn(`Rate limit exceeded for ${endpoint}`);
      return false;
    }

    this.rateLimiter.set(key, current + 1);
    
    // Clean up old entries
    for (const [k, v] of this.rateLimiter.entries()) {
      if (k.split('_')[1] && parseInt(k.split('_')[1]) < Math.floor((now - windowMs) / windowMs)) {
        this.rateLimiter.delete(k);
      }
    }

    return true;
  }

  // Common error handling
  protected handleError(error: any, context: string): Error {
    logger.error(`Broker error in ${context}:`, error);
    
    if (error.response?.status === 401) {
      return new Error('Invalid API credentials');
    } else if (error.response?.status === 429) {
      return new Error('Rate limit exceeded');
    } else if (error.response?.status >= 500) {
      return new Error('Broker service unavailable');
    } else if (error.code === 'ECONNREFUSED') {
      return new Error('Connection refused by broker');
    } else if (error.code === 'ETIMEDOUT') {
      return new Error('Request timeout');
    }

    return new Error(error.message || 'Unknown broker error');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      return await this.validateCredentials();
    } catch (error) {
      logger.error('Broker health check failed:', error);
      return false;
    }
  }

  // Get connection status
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}