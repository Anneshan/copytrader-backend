import { BaseBroker, BrokerCredentials } from './baseBroker';
import { DeltaExchangeBroker } from './deltaExchange';
import { BinanceFuturesBroker } from './binanceFutures';
import { BybitBroker } from './bybit';
import { OKXBroker } from './okx';
import { logger } from '../../utils/logger';

export type SupportedBroker = 'DELTA' | 'BINANCE' | 'BYBIT' | 'OKX';

export class BrokerFactory {
  private static instances: Map<string, BaseBroker> = new Map();

  static createBroker(
    brokerType: SupportedBroker,
    credentials: BrokerCredentials,
    instanceId?: string
  ): BaseBroker {
    const key = instanceId || `${brokerType}_${credentials.apiKey.substring(0, 8)}`;
    
    // Return existing instance if available
    if (this.instances.has(key)) {
      return this.instances.get(key)!;
    }

    let broker: BaseBroker;

    switch (brokerType) {
      case 'DELTA':
        broker = new DeltaExchangeBroker(credentials);
        break;
      case 'BINANCE':
        broker = new BinanceFuturesBroker(credentials);
        break;
      case 'BYBIT':
        broker = new BybitBroker(credentials);
        break;
      case 'OKX':
        broker = new OKXBroker(credentials);
        break;
      default:
        throw new Error(`Unsupported broker type: ${brokerType}`);
    }

    // Store instance for reuse
    this.instances.set(key, broker);
    
    // Set up error handling
    broker.on('error', (error) => {
      logger.error(`Broker ${brokerType} error:`, error);
    });

    // Set up market data handling
    broker.on('marketData', (data) => {
      logger.debug(`Market data from ${brokerType}:`, data);
    });

    logger.info(`Created ${brokerType} broker instance: ${key}`);
    return broker;
  }

  static async connectBroker(
    brokerType: SupportedBroker,
    credentials: BrokerCredentials,
    instanceId?: string
  ): Promise<BaseBroker> {
    const broker = this.createBroker(brokerType, credentials, instanceId);
    
    if (!broker.getConnectionStatus()) {
      await broker.connect();
    }
    
    return broker;
  }

  static getBroker(instanceId: string): BaseBroker | undefined {
    return this.instances.get(instanceId);
  }

  static async disconnectBroker(instanceId: string): Promise<void> {
    const broker = this.instances.get(instanceId);
    if (broker) {
      await broker.disconnect();
      this.instances.delete(instanceId);
      logger.info(`Disconnected and removed broker instance: ${instanceId}`);
    }
  }

  static async disconnectAllBrokers(): Promise<void> {
    const disconnectPromises = Array.from(this.instances.entries()).map(
      async ([key, broker]) => {
        try {
          await broker.disconnect();
          logger.info(`Disconnected broker instance: ${key}`);
        } catch (error) {
          logger.error(`Error disconnecting broker ${key}:`, error);
        }
      }
    );

    await Promise.all(disconnectPromises);
    this.instances.clear();
    logger.info('All broker instances disconnected');
  }

  static getConnectedBrokers(): string[] {
    return Array.from(this.instances.entries())
      .filter(([_, broker]) => broker.getConnectionStatus())
      .map(([key, _]) => key);
  }

  static async healthCheckAll(): Promise<Record<string, boolean>> {
    const healthChecks: Record<string, boolean> = {};
    
    const checkPromises = Array.from(this.instances.entries()).map(
      async ([key, broker]) => {
        try {
          healthChecks[key] = await broker.healthCheck();
        } catch (error) {
          logger.error(`Health check failed for broker ${key}:`, error);
          healthChecks[key] = false;
        }
      }
    );

    await Promise.all(checkPromises);
    return healthChecks;
  }

  static getSupportedBrokers(): SupportedBroker[] {
    return ['DELTA', 'BINANCE', 'BYBIT', 'OKX'];
  }

  static getBrokerInfo(brokerType: SupportedBroker): {
    name: string;
    baseUrl: string;
    wsUrl: string;
    features: string[];
  } {
    const brokerInfo = {
      DELTA: {
        name: 'Delta Exchange',
        baseUrl: 'https://api.delta.exchange',
        wsUrl: 'wss://socket.delta.exchange',
        features: ['futures', 'options', 'perpetual'],
      },
      BINANCE: {
        name: 'Binance Futures',
        baseUrl: 'https://fapi.binance.com',
        wsUrl: 'wss://fstream.binance.com',
        features: ['futures', 'perpetual', 'margin'],
      },
      BYBIT: {
        name: 'Bybit',
        baseUrl: 'https://api.bybit.com',
        wsUrl: 'wss://stream.bybit.com',
        features: ['futures', 'perpetual', 'spot'],
      },
      OKX: {
        name: 'OKX',
        baseUrl: 'https://www.okx.com',
        wsUrl: 'wss://ws.okx.com',
        features: ['futures', 'perpetual', 'spot', 'options'],
      },
    };

    return brokerInfo[brokerType];
  }
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, disconnecting all brokers...');
  await BrokerFactory.disconnectAllBrokers();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, disconnecting all brokers...');
  await BrokerFactory.disconnectAllBrokers();
});