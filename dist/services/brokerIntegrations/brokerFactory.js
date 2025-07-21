"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerFactory = void 0;
const deltaExchange_1 = require("./deltaExchange");
const binanceFutures_1 = require("./binanceFutures");
const bybit_1 = require("./bybit");
const okx_1 = require("./okx");
const logger_1 = require("../../utils/logger");
class BrokerFactory {
    static createBroker(brokerType, credentials, instanceId) {
        const key = instanceId || `${brokerType}_${credentials.apiKey.substring(0, 8)}`;
        if (this.instances.has(key)) {
            return this.instances.get(key);
        }
        let broker;
        switch (brokerType) {
            case 'DELTA':
                broker = new deltaExchange_1.DeltaExchangeBroker(credentials);
                break;
            case 'BINANCE':
                broker = new binanceFutures_1.BinanceFuturesBroker(credentials);
                break;
            case 'BYBIT':
                broker = new bybit_1.BybitBroker(credentials);
                break;
            case 'OKX':
                broker = new okx_1.OKXBroker(credentials);
                break;
            default:
                throw new Error(`Unsupported broker type: ${brokerType}`);
        }
        this.instances.set(key, broker);
        broker.on('error', (error) => {
            logger_1.logger.error(`Broker ${brokerType} error:`, error);
        });
        broker.on('marketData', (data) => {
            logger_1.logger.debug(`Market data from ${brokerType}:`, data);
        });
        logger_1.logger.info(`Created ${brokerType} broker instance: ${key}`);
        return broker;
    }
    static async connectBroker(brokerType, credentials, instanceId) {
        const broker = this.createBroker(brokerType, credentials, instanceId);
        if (!broker.getConnectionStatus()) {
            await broker.connect();
        }
        return broker;
    }
    static getBroker(instanceId) {
        return this.instances.get(instanceId);
    }
    static async disconnectBroker(instanceId) {
        const broker = this.instances.get(instanceId);
        if (broker) {
            await broker.disconnect();
            this.instances.delete(instanceId);
            logger_1.logger.info(`Disconnected and removed broker instance: ${instanceId}`);
        }
    }
    static async disconnectAllBrokers() {
        const disconnectPromises = Array.from(this.instances.entries()).map(async ([key, broker]) => {
            try {
                await broker.disconnect();
                logger_1.logger.info(`Disconnected broker instance: ${key}`);
            }
            catch (error) {
                logger_1.logger.error(`Error disconnecting broker ${key}:`, error);
            }
        });
        await Promise.all(disconnectPromises);
        this.instances.clear();
        logger_1.logger.info('All broker instances disconnected');
    }
    static getConnectedBrokers() {
        return Array.from(this.instances.entries())
            .filter(([_, broker]) => broker.getConnectionStatus())
            .map(([key, _]) => key);
    }
    static async healthCheckAll() {
        const healthChecks = {};
        const checkPromises = Array.from(this.instances.entries()).map(async ([key, broker]) => {
            try {
                healthChecks[key] = await broker.healthCheck();
            }
            catch (error) {
                logger_1.logger.error(`Health check failed for broker ${key}:`, error);
                healthChecks[key] = false;
            }
        });
        await Promise.all(checkPromises);
        return healthChecks;
    }
    static getSupportedBrokers() {
        return ['DELTA', 'BINANCE', 'BYBIT', 'OKX'];
    }
    static getBrokerInfo(brokerType) {
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
exports.BrokerFactory = BrokerFactory;
BrokerFactory.instances = new Map();
process.on('SIGTERM', async () => {
    logger_1.logger.info('Received SIGTERM, disconnecting all brokers...');
    await BrokerFactory.disconnectAllBrokers();
});
process.on('SIGINT', async () => {
    logger_1.logger.info('Received SIGINT, disconnecting all brokers...');
    await BrokerFactory.disconnectAllBrokers();
});
//# sourceMappingURL=brokerFactory.js.map