import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';
import { BaseBroker, BrokerCredentials, TradeOrder, TradeResult, AccountBalance, Position, MarketData } from './baseBroker';
import { logger } from '../../utils/logger';

export class BinanceFuturesBroker extends BaseBroker {
  private apiClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private readonly baseURL = 'https://fapi.binance.com';
  private readonly wsURL = 'wss://fstream.binance.com/ws';

  constructor(credentials: BrokerCredentials) {
    super(credentials);
    
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-MBX-APIKEY': this.credentials.apiKey,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.request.use((config) => {
      // Add signature for authenticated endpoints
      if (config.url?.includes('/fapi/v1/') || config.url?.includes('/fapi/v2/')) {
        const timestamp = Date.now();
        const params = new URLSearchParams(config.params);
        params.append('timestamp', timestamp.toString());

        const signature = crypto
          .createHmac('sha256', this.credentials.apiSecret)
          .update(params.toString())
          .digest('hex');

        params.append('signature', signature);
        config.params = Object.fromEntries(params);
      }

      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        throw this.handleError(error, 'Binance Futures API');
      }
    );
  }

  async connect(): Promise<void> {
    try {
      await this.validateCredentials();
      await this.connectWebSocket();
      this.isConnected = true;
      logger.info('Connected to Binance Futures');
    } catch (error) {
      throw this.handleError(error, 'Binance Futures connection');
    }
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.isConnected = false;
    logger.info('Disconnected from Binance Futures');
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.checkRateLimit('validate', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/fapi/v2/account');
      return response.status === 200 && response.data.canTrade;
    } catch (error) {
      logger.error('Binance Futures credential validation failed:', error);
      return false;
    }
  }

  async getAccountBalance(): Promise<AccountBalance[]> {
    try {
      if (!this.checkRateLimit('balance', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/fapi/v2/balance');
      
      return response.data
        .filter((balance: any) => parseFloat(balance.balance) > 0)
        .map((balance: any) => ({
          asset: balance.asset,
          free: parseFloat(balance.availableBalance),
          locked: parseFloat(balance.balance) - parseFloat(balance.availableBalance),
          total: parseFloat(balance.balance),
        }));
    } catch (error) {
      throw this.handleError(error, 'Binance Futures get balance');
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      if (!this.checkRateLimit('positions', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/fapi/v2/positionRisk');
      
      return response.data
        .filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
        .map((position: any) => ({
          symbol: position.symbol,
          side: parseFloat(position.positionAmt) > 0 ? 'long' : 'short',
          size: Math.abs(parseFloat(position.positionAmt)),
          entryPrice: parseFloat(position.entryPrice),
          markPrice: parseFloat(position.markPrice),
          pnl: parseFloat(position.unRealizedProfit),
          percentage: parseFloat(position.percentage),
        }));
    } catch (error) {
      throw this.handleError(error, 'Binance Futures get positions');
    }
  }

  async placeOrder(order: TradeOrder): Promise<TradeResult> {
    try {
      if (!this.checkRateLimit('order', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const orderData: any = {
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
        fees: 0, // Fees are calculated separately in Binance
      };
    } catch (error) {
      throw this.handleError(error, 'Binance Futures place order');
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
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
    } catch (error) {
      throw this.handleError(error, 'Binance Futures cancel order');
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<TradeResult> {
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
    } catch (error) {
      throw this.handleError(error, 'Binance Futures get order status');
    }
  }

  async subscribeToMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      await this.connectWebSocket();
    }

    const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
    const subscribeMessage = {
      method: 'SUBSCRIBE',
      params: streams,
      id: Date.now(),
    };

    this.wsClient?.send(JSON.stringify(subscribeMessage));
    logger.info(`Subscribed to market data for: ${symbols.join(', ')}`);
  }

  async unsubscribeFromMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      return;
    }

    const streams = symbols.map(symbol => `${symbol.toLowerCase()}@ticker`);
    const unsubscribeMessage = {
      method: 'UNSUBSCRIBE',
      params: streams,
      id: Date.now(),
    };

    this.wsClient?.send(JSON.stringify(unsubscribeMessage));
    logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(this.wsURL);

      this.wsClient.on('open', () => {
        logger.info('Binance Futures WebSocket connected');
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
        logger.error('Binance Futures WebSocket error:', error);
        reject(error);
      });

      this.wsClient.on('close', () => {
        logger.info('Binance Futures WebSocket disconnected');
        this.wsClient = null;
      });
    });
  }

  private handleWebSocketMessage(message: any): void {
    if (message.e === '24hrTicker') {
      const marketData: MarketData = {
        symbol: message.s,
        price: parseFloat(message.c),
        change24h: parseFloat(message.P),
        volume24h: parseFloat(message.v),
        timestamp: new Date(message.E),
      };

      this.emit('marketData', marketData);
    }
  }

  private mapOrderStatus(status: string): 'pending' | 'filled' | 'cancelled' | 'rejected' {
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