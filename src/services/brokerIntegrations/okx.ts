import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';
import { BaseBroker, BrokerCredentials, TradeOrder, TradeResult, AccountBalance, Position, MarketData } from './baseBroker';
import { logger } from '../../utils/logger';

export class OKXBroker extends BaseBroker {
  private apiClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private readonly baseURL = 'https://www.okx.com';
  private readonly wsURL = 'wss://ws.okx.com:8443/ws/v5/public';

  constructor(credentials: BrokerCredentials) {
    super(credentials);
    
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.request.use((config) => {
      const timestamp = new Date().toISOString();
      const method = config.method?.toUpperCase() || 'GET';
      const path = config.url || '';
      const body = config.data ? JSON.stringify(config.data) : '';
      
      const message = timestamp + method + path + body;
      const signature = crypto
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

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        throw this.handleError(error, 'OKX API');
      }
    );
  }

  async connect(): Promise<void> {
    try {
      await this.validateCredentials();
      await this.connectWebSocket();
      this.isConnected = true;
      logger.info('Connected to OKX');
    } catch (error) {
      throw this.handleError(error, 'OKX connection');
    }
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.isConnected = false;
    logger.info('Disconnected from OKX');
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.checkRateLimit('validate', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/api/v5/account/config');
      return response.data.code === '0';
    } catch (error) {
      logger.error('OKX credential validation failed:', error);
      return false;
    }
  }

  async getAccountBalance(): Promise<AccountBalance[]> {
    try {
      if (!this.checkRateLimit('balance', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/api/v5/account/balance');
      
      if (response.data.code !== '0') {
        throw new Error('Failed to fetch balance');
      }

      const balances: AccountBalance[] = [];
      response.data.data.forEach((account: any) => {
        account.details.forEach((detail: any) => {
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
    } catch (error) {
      throw this.handleError(error, 'OKX get balance');
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      if (!this.checkRateLimit('positions', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/api/v5/account/positions');
      
      if (response.data.code !== '0') {
        throw new Error('Failed to fetch positions');
      }

      return response.data.data
        .filter((pos: any) => parseFloat(pos.pos) !== 0)
        .map((position: any) => ({
          symbol: position.instId,
          side: position.posSide === 'long' ? 'long' : 'short',
          size: Math.abs(parseFloat(position.pos)),
          entryPrice: parseFloat(position.avgPx),
          markPrice: parseFloat(position.markPx),
          pnl: parseFloat(position.upl),
          percentage: parseFloat(position.uplRatio) * 100,
        }));
    } catch (error) {
      throw this.handleError(error, 'OKX get positions');
    }
  }

  async placeOrder(order: TradeOrder): Promise<TradeResult> {
    try {
      if (!this.checkRateLimit('order', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const orderData: any = {
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
    } catch (error) {
      throw this.handleError(error, 'OKX place order');
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    try {
      if (!this.checkRateLimit('cancel', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.post('/api/v5/trade/cancel-order', {
        instId: symbol,
        ordId: orderId,
      });

      return response.data.code === '0';
    } catch (error) {
      throw this.handleError(error, 'OKX cancel order');
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<TradeResult> {
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
    } catch (error) {
      throw this.handleError(error, 'OKX get order status');
    }
  }

  async subscribeToMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
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
    logger.info(`Subscribed to market data for: ${symbols.join(', ')}`);
  }

  async unsubscribeFromMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
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
    logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(this.wsURL);

      this.wsClient.on('open', () => {
        logger.info('OKX WebSocket connected');
        resolve();
      });

      this.wsClient.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
        }
      });

      this.wsClient.on('error', (error) => {
        logger.error('OKX WebSocket error:', error);
        reject(error);
      });

      this.wsClient.on('close', () => {
        logger.info('OKX WebSocket disconnected');
        this.wsClient = null;
      });
    });
  }

  private handleWebSocketMessage(message: any): void {
    if (message.arg?.channel === 'tickers' && message.data) {
      const ticker = message.data[0];
      const marketData: MarketData = {
        symbol: ticker.instId,
        price: parseFloat(ticker.last),
        change24h: parseFloat(ticker.sodUtc8),
        volume24h: parseFloat(ticker.vol24h),
        timestamp: new Date(parseInt(ticker.ts)),
      };

      this.emit('marketData', marketData);
    }
  }

  private mapOrderStatus(state: string): 'pending' | 'filled' | 'cancelled' | 'rejected' {
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