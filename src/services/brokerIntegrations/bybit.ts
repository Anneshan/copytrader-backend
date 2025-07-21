import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';
import { BaseBroker, BrokerCredentials, TradeOrder, TradeResult, AccountBalance, Position, MarketData } from './baseBroker';
import { logger } from '../../utils/logger';

export class BybitBroker extends BaseBroker {
  private apiClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private readonly baseURL = 'https://api.bybit.com';
  private readonly wsURL = 'wss://stream.bybit.com/v5/public/linear';

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
      const timestamp = Date.now().toString();
      const recvWindow = '5000';
      
      // Prepare parameters
      let params = '';
      if (config.method?.toLowerCase() === 'get' && config.params) {
        params = new URLSearchParams(config.params).toString();
      } else if (config.data) {
        params = JSON.stringify(config.data);
      }

      // Create signature
      const message = timestamp + this.credentials.apiKey + recvWindow + params;
      const signature = crypto
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

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        throw this.handleError(error, 'Bybit API');
      }
    );
  }

  async connect(): Promise<void> {
    try {
      await this.validateCredentials();
      await this.connectWebSocket();
      this.isConnected = true;
      logger.info('Connected to Bybit');
    } catch (error) {
      throw this.handleError(error, 'Bybit connection');
    }
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.isConnected = false;
    logger.info('Disconnected from Bybit');
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.checkRateLimit('validate', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/v5/account/info');
      return response.data.retCode === 0;
    } catch (error) {
      logger.error('Bybit credential validation failed:', error);
      return false;
    }
  }

  async getAccountBalance(): Promise<AccountBalance[]> {
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

      const balances: AccountBalance[] = [];
      response.data.result.list.forEach((account: any) => {
        account.coin.forEach((coin: any) => {
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
    } catch (error) {
      throw this.handleError(error, 'Bybit get balance');
    }
  }

  async getPositions(): Promise<Position[]> {
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
        .filter((pos: any) => parseFloat(pos.size) !== 0)
        .map((position: any) => ({
          symbol: position.symbol,
          side: position.side.toLowerCase(),
          size: parseFloat(position.size),
          entryPrice: parseFloat(position.avgPrice),
          markPrice: parseFloat(position.markPrice),
          pnl: parseFloat(position.unrealisedPnl),
          percentage: parseFloat(position.unrealisedPnl) / parseFloat(position.positionValue) * 100,
        }));
    } catch (error) {
      throw this.handleError(error, 'Bybit get positions');
    }
  }

  async placeOrder(order: TradeOrder): Promise<TradeResult> {
    try {
      if (!this.checkRateLimit('order', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const orderData: any = {
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
    } catch (error) {
      throw this.handleError(error, 'Bybit place order');
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
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
    } catch (error) {
      throw this.handleError(error, 'Bybit cancel order');
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<TradeResult> {
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
    } catch (error) {
      throw this.handleError(error, 'Bybit get order status');
    }
  }

  async subscribeToMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      await this.connectWebSocket();
    }

    const subscribeMessage = {
      op: 'subscribe',
      args: symbols.map(symbol => `tickers.${symbol}`),
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
      args: symbols.map(symbol => `tickers.${symbol}`),
    };

    this.wsClient?.send(JSON.stringify(unsubscribeMessage));
    logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(this.wsURL);

      this.wsClient.on('open', () => {
        logger.info('Bybit WebSocket connected');
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
        logger.error('Bybit WebSocket error:', error);
        reject(error);
      });

      this.wsClient.on('close', () => {
        logger.info('Bybit WebSocket disconnected');
        this.wsClient = null;
      });
    });
  }

  private handleWebSocketMessage(message: any): void {
    if (message.topic && message.topic.startsWith('tickers.') && message.data) {
      const marketData: MarketData = {
        symbol: message.data.symbol,
        price: parseFloat(message.data.lastPrice),
        change24h: parseFloat(message.data.price24hPcnt) * 100,
        volume24h: parseFloat(message.data.volume24h),
        timestamp: new Date(parseInt(message.ts)),
      };

      this.emit('marketData', marketData);
    }
  }

  private mapOrderStatus(status: string): 'pending' | 'filled' | 'cancelled' | 'rejected' {
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