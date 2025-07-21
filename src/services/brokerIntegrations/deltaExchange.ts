import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';
import { BaseBroker, BrokerCredentials, TradeOrder, TradeResult, AccountBalance, Position, MarketData } from './baseBroker';
import { logger } from '../../utils/logger';

export class DeltaExchangeBroker extends BaseBroker {
  private apiClient: AxiosInstance;
  private wsClient: WebSocket | null = null;
  private readonly baseURL = 'https://api.delta.exchange';
  private readonly wsURL = 'wss://socket.delta.exchange';

  constructor(credentials: BrokerCredentials) {
    super(credentials);
    
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CopyTrader-Pro/1.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.request.use((config) => {
      const timestamp = Date.now().toString();
      const method = config.method?.toUpperCase() || 'GET';
      const path = config.url || '';
      const body = config.data ? JSON.stringify(config.data) : '';
      
      const message = method + timestamp + path + body;
      const signature = crypto
        .createHmac('sha256', this.credentials.apiSecret)
        .update(message)
        .digest('hex');

      if (config.headers) {
        config.headers['api-key'] = this.credentials.apiKey;
        config.headers['timestamp'] = timestamp;
        config.headers['signature'] = signature;
      }

      return config;
    });

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        throw this.handleError(error, 'Delta Exchange API');
      }
    );
  }

  async connect(): Promise<void> {
    try {
      await this.validateCredentials();
      await this.connectWebSocket();
      this.isConnected = true;
      logger.info('Connected to Delta Exchange');
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange connection');
    }
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    this.isConnected = false;
    logger.info('Disconnected from Delta Exchange');
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.checkRateLimit('validate', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/v2/profile');
      return response.status === 200 && response.data.success;
    } catch (error) {
      logger.error('Delta Exchange credential validation failed:', error);
      return false;
    }
  }

  async getAccountBalance(): Promise<AccountBalance[]> {
    try {
      if (!this.checkRateLimit('balance', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/v2/wallet/balances');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch balance');
      }

      return response.data.result.map((balance: any) => ({
        asset: balance.asset_symbol,
        free: parseFloat(balance.available_balance),
        locked: parseFloat(balance.order_margin),
        total: parseFloat(balance.wallet_balance),
      }));
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange get balance');
    }
  }

  async getPositions(): Promise<Position[]> {
    try {
      if (!this.checkRateLimit('positions', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get('/v2/positions');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch positions');
      }

      return response.data.result
        .filter((pos: any) => parseFloat(pos.size) !== 0)
        .map((position: any) => ({
          symbol: position.product_symbol,
          side: parseFloat(position.size) > 0 ? 'long' : 'short',
          size: Math.abs(parseFloat(position.size)),
          entryPrice: parseFloat(position.entry_price),
          markPrice: parseFloat(position.mark_price),
          pnl: parseFloat(position.unrealized_pnl),
          percentage: parseFloat(position.unrealized_pnl_percent),
        }));
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange get positions');
    }
  }

  async placeOrder(order: TradeOrder): Promise<TradeResult> {
    try {
      if (!this.checkRateLimit('order', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const orderData = {
        product_id: await this.getProductId(order.symbol),
        side: order.side,
        order_type: order.type,
        size: order.quantity.toString(),
        ...(order.price && { limit_price: order.price.toString() }),
        ...(order.stopPrice && { stop_price: order.stopPrice.toString() }),
        time_in_force: order.timeInForce || 'GTC',
      };

      const response = await this.apiClient.post('/v2/orders', orderData);
      
      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Order placement failed');
      }

      const result = response.data.result;
      return {
        orderId: result.id.toString(),
        symbol: order.symbol,
        side: order.side,
        quantity: parseFloat(result.size),
        price: parseFloat(result.limit_price || result.average_fill_price || '0'),
        status: this.mapOrderStatus(result.state),
        timestamp: new Date(result.created_at),
        fees: parseFloat(result.commission || '0'),
      };
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange place order');
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    try {
      if (!this.checkRateLimit('cancel', 20, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const productId = await this.getProductId(symbol);
      const response = await this.apiClient.delete(`/v2/orders/${orderId}`, {
        data: { product_id: productId }
      });

      return response.data.success;
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange cancel order');
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<TradeResult> {
    try {
      if (!this.checkRateLimit('order_status', 10, 60000)) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.get(`/v2/orders/${orderId}`);
      
      if (!response.data.success) {
        throw new Error('Failed to fetch order status');
      }

      const order = response.data.result;
      return {
        orderId: order.id.toString(),
        symbol: symbol,
        side: order.side,
        quantity: parseFloat(order.size),
        price: parseFloat(order.limit_price || order.average_fill_price || '0'),
        status: this.mapOrderStatus(order.state),
        timestamp: new Date(order.created_at),
        fees: parseFloat(order.commission || '0'),
      };
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange get order status');
    }
  }

  async subscribeToMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      await this.connectWebSocket();
    }

    for (const symbol of symbols) {
      const productId = await this.getProductId(symbol);
      const subscribeMessage = {
        type: 'subscribe',
        payload: {
          channels: [
            {
              name: 'ticker',
              symbols: [productId.toString()],
            },
          ],
        },
      };

      this.wsClient?.send(JSON.stringify(subscribeMessage));
    }

    logger.info(`Subscribed to market data for: ${symbols.join(', ')}`);
  }

  async unsubscribeFromMarketData(symbols: string[]): Promise<void> {
    if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const symbol of symbols) {
      const productId = await this.getProductId(symbol);
      const unsubscribeMessage = {
        type: 'unsubscribe',
        payload: {
          channels: [
            {
              name: 'ticker',
              symbols: [productId.toString()],
            },
          ],
        },
      };

      this.wsClient?.send(JSON.stringify(unsubscribeMessage));
    }

    logger.info(`Unsubscribed from market data for: ${symbols.join(', ')}`);
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsClient = new WebSocket(this.wsURL);

      this.wsClient.on('open', () => {
        logger.info('Delta Exchange WebSocket connected');
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
        logger.error('Delta Exchange WebSocket error:', error);
        reject(error);
      });

      this.wsClient.on('close', () => {
        logger.info('Delta Exchange WebSocket disconnected');
        this.wsClient = null;
      });
    });
  }

  private handleWebSocketMessage(message: any): void {
    if (message.type === 'ticker' && message.symbol) {
      const marketData: MarketData = {
        symbol: message.symbol,
        price: parseFloat(message.close),
        change24h: parseFloat(message.change_24h),
        volume24h: parseFloat(message.volume),
        timestamp: new Date(),
      };

      this.emit('marketData', marketData);
    }
  }

  private async getProductId(symbol: string): Promise<number> {
    // Cache product IDs to avoid repeated API calls
    const cacheKey = `product_id_${symbol}`;
    
    try {
      const response = await this.apiClient.get('/v2/products');
      const product = response.data.result.find((p: any) => p.symbol === symbol);
      
      if (!product) {
        throw new Error(`Product not found for symbol: ${symbol}`);
      }

      return product.id;
    } catch (error) {
      throw this.handleError(error, 'Delta Exchange get product ID');
    }
  }

  private mapOrderStatus(state: string): 'pending' | 'filled' | 'cancelled' | 'rejected' {
    switch (state.toLowerCase()) {
      case 'open':
      case 'pending':
        return 'pending';
      case 'filled':
      case 'closed':
        return 'filled';
      case 'cancelled':
        return 'cancelled';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }
}