import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create a test user
  const hashedPassword = await bcrypt.hash('password123', 12);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@copytrader.com' },
    update: {},
    create: {
      email: 'test@copytrader.com',
      firstName: 'Test',
      lastName: 'User',
      passwordHash: hashedPassword,
      kycStatus: 'APPROVED',
      emailVerified: true,
      isActive: true,
    },
  });

  console.log('✅ Created test user:', user.email);

  // Create master trader accounts
  const masterAccounts = await Promise.all([
    prisma.brokerAccount.create({
      data: {
        userId: user.id,
        broker: 'DELTA',
        accountType: 'MASTER',
        name: 'Delta Master Account',
        apiKey: 'encrypted_api_key_1',
        apiSecret: 'encrypted_api_secret_1',
        isActive: true,
        balance: 25000.00,
        pnl: 3250.75,
        winRate: 78.5,
        totalTrades: 156,
        followers: 12,
        riskLevel: 'MEDIUM',
        monthlyReturn: 15.2,
        lastSync: new Date(),
      },
    }),
    prisma.brokerAccount.create({
      data: {
        userId: user.id,
        broker: 'BINANCE',
        accountType: 'MASTER',
        name: 'Binance Master Account',
        apiKey: 'encrypted_api_key_2',
        apiSecret: 'encrypted_api_secret_2',
        isActive: true,
        balance: 18000.00,
        pnl: 2100.50,
        winRate: 82.1,
        totalTrades: 89,
        followers: 8,
        riskLevel: 'LOW',
        monthlyReturn: 8.5,
        lastSync: new Date(),
      },
    }),
  ]);

  console.log('✅ Created master accounts');

  // Create follower accounts
  const followerAccounts = await Promise.all([
    prisma.brokerAccount.create({
      data: {
        userId: user.id,
        broker: 'BINANCE',
        accountType: 'FOLLOWER',
        name: 'Binance Follower',
        apiKey: 'encrypted_api_key_3',
        apiSecret: 'encrypted_api_secret_3',
        isActive: true,
        balance: 15000.00,
        pnl: -850.25,
        winRate: 65.3,
        totalTrades: 45,
        followers: 0,
        riskLevel: 'MEDIUM',
        monthlyReturn: -5.2,
        lastSync: new Date(),
      },
    }),
    prisma.brokerAccount.create({
      data: {
        userId: user.id,
        broker: 'BYBIT',
        accountType: 'FOLLOWER',
        name: 'Bybit Follower',
        apiKey: 'encrypted_api_key_4',
        apiSecret: 'encrypted_api_secret_4',
        isActive: true,
        balance: 8000.00,
        pnl: 420.75,
        winRate: 71.2,
        totalTrades: 23,
        followers: 0,
        riskLevel: 'HIGH',
        monthlyReturn: 18.7,
        lastSync: new Date(),
      },
    }),
  ]);

  console.log('✅ Created follower accounts');

  // Create subscriptions
  const subscriptions = await Promise.all([
    prisma.subscription.create({
      data: {
        userId: user.id,
        masterAccountId: masterAccounts[0].id,
        followerAccountId: followerAccounts[0].id,
        multiplier: 2.0,
        maxPositionSize: 10000.00,
        dailyLossLimit: 1000.00,
        isActive: true,
        pnl: 1250.75,
        totalTrades: 15,
        winRate: 73.3,
        monthlyReturn: 12.8,
      },
    }),
    prisma.subscription.create({
      data: {
        userId: user.id,
        masterAccountId: masterAccounts[1].id,
        followerAccountId: followerAccounts[1].id,
        multiplier: 1.5,
        maxPositionSize: 5000.00,
        dailyLossLimit: 500.00,
        isActive: true,
        pnl: 320.50,
        totalTrades: 8,
        winRate: 87.5,
        monthlyReturn: 6.2,
      },
    }),
  ]);

  console.log('✅ Created subscriptions');

  // Create sample trades
  const trades = await Promise.all([
    prisma.trade.create({
      data: {
        userId: user.id,
        accountId: masterAccounts[0].id,
        subscriptionId: subscriptions[0].id,
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.5,
        price: 45000.00,
        executedPrice: 45025.50,
        pnl: 1250.50,
        status: 'EXECUTED',
        brokerTradeId: 'btc_trade_001',
        isCopyTrade: false,
        executionTime: 45,
        slippage: 0.056,
        fees: 2.25,
        executedAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    }),
    prisma.trade.create({
      data: {
        userId: user.id,
        accountId: followerAccounts[0].id,
        subscriptionId: subscriptions[0].id,
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 1.0,
        price: 45000.00,
        executedPrice: 45030.00,
        pnl: -320.75,
        status: 'EXECUTED',
        brokerTradeId: 'btc_trade_002',
        isCopyTrade: true,
        masterTradeId: 'btc_trade_001',
        executionTime: 52,
        slippage: 0.067,
        fees: 4.50,
        executedAt: new Date(Date.now() - 1800000), // 30 minutes ago
      },
    }),
    prisma.trade.create({
      data: {
        userId: user.id,
        accountId: masterAccounts[0].id,
        subscriptionId: subscriptions[0].id,
        symbol: 'ETHUSDT',
        side: 'SELL',
        quantity: 2.0,
        price: 3200.00,
        executedPrice: 3195.75,
        pnl: 85.25,
        status: 'EXECUTED',
        brokerTradeId: 'eth_trade_001',
        isCopyTrade: false,
        executionTime: 38,
        slippage: 0.133,
        fees: 1.60,
        executedAt: new Date(Date.now() - 7200000), // 2 hours ago
      },
    }),
    prisma.trade.create({
      data: {
        userId: user.id,
        accountId: masterAccounts[1].id,
        subscriptionId: subscriptions[1].id,
        symbol: 'ADAUSDT',
        side: 'BUY',
        quantity: 1000,
        price: 0.45,
        executedPrice: 0.452,
        pnl: 20.00,
        status: 'EXECUTED',
        brokerTradeId: 'ada_trade_001',
        isCopyTrade: false,
        executionTime: 42,
        slippage: 0.444,
        fees: 0.45,
        executedAt: new Date(Date.now() - 10800000), // 3 hours ago
      },
    }),
  ]);

  console.log('✅ Created sample trades');

  // Create sample positions
  const positions = await Promise.all([
    prisma.position.create({
      data: {
        accountId: masterAccounts[0].id,
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.5,
        entryPrice: 45000.00,
        currentPrice: 45250.00,
        pnl: 125.00,
        percentage: 0.556,
        isOpen: true,
        openedAt: new Date(Date.now() - 3600000),
      },
    }),
    prisma.position.create({
      data: {
        accountId: followerAccounts[0].id,
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 1.0,
        entryPrice: 45000.00,
        currentPrice: 45250.00,
        pnl: 250.00,
        percentage: 0.556,
        isOpen: true,
        openedAt: new Date(Date.now() - 1800000),
      },
    }),
  ]);

  console.log('✅ Created sample positions');

  // Create sample market data
  const marketData = await Promise.all([
    prisma.marketData.create({
      data: {
        accountId: masterAccounts[0].id,
        symbol: 'BTCUSDT',
        price: 45250.00,
        bid: 45245.00,
        ask: 45255.00,
        volume: 1250.5,
        change24h: 2.5,
        volume24h: 1250000.00,
        spread: 0.022,
        timestamp: new Date(),
      },
    }),
    prisma.marketData.create({
      data: {
        accountId: masterAccounts[0].id,
        symbol: 'ETHUSDT',
        price: 3200.00,
        bid: 3198.50,
        ask: 3201.50,
        volume: 850.25,
        change24h: -1.2,
        volume24h: 850000.00,
        spread: 0.094,
        timestamp: new Date(),
      },
    }),
  ]);

  console.log('✅ Created sample market data');

  // Create sample notifications
  const notifications = await Promise.all([
    prisma.notification.create({
      data: {
        userId: user.id,
        type: 'TRADE_EXECUTED',
        title: 'Trade Executed',
        message: 'BTCUSDT BUY order executed successfully',
        priority: 'NORMAL',
        metadata: { tradeId: trades[0].id, symbol: 'BTCUSDT' },
      },
    }),
    prisma.notification.create({
      data: {
        userId: user.id,
        type: 'ACCOUNT_SYNC',
        title: 'Account Synced',
        message: 'Delta Master Account synchronized successfully',
        priority: 'LOW',
        metadata: { accountId: masterAccounts[0].id },
      },
    }),
  ]);

  console.log('✅ Created sample notifications');

  // Create sample performance metrics
  const performanceMetrics = await Promise.all([
    prisma.performanceMetric.create({
      data: {
        userId: user.id,
        accountId: masterAccounts[0].id,
        date: new Date(),
        totalPnL: 3250.75,
        winRate: 78.5,
        totalTrades: 156,
        avgTradeSize: 125.50,
        maxDrawdown: -8.2,
        sharpeRatio: 1.85,
        monthlyReturn: 15.2,
        bestTrade: 1250.50,
        worstTrade: -320.75,
      },
    }),
    prisma.performanceMetric.create({
      data: {
        userId: user.id,
        accountId: followerAccounts[0].id,
        date: new Date(),
        totalPnL: -850.25,
        winRate: 65.3,
        totalTrades: 45,
        avgTradeSize: 85.25,
        maxDrawdown: -12.5,
        sharpeRatio: 0.95,
        monthlyReturn: -5.2,
        bestTrade: 420.75,
        worstTrade: -650.00,
      },
    }),
  ]);

  console.log('✅ Created sample performance metrics');

  // Create sample master traders
  const masterTraders = await Promise.all([
    prisma.masterTrader.create({
      data: {
        name: 'Expert Trader #1',
        broker: 'DELTA',
        winRate: 78.5,
        monthlyReturn: 15.2,
        followers: 245,
        riskLevel: 'MEDIUM',
        pnl: 12500.00,
        totalTrades: 156,
        isActive: true,
        description: 'Experienced crypto trader with consistent returns',
        tags: ['crypto', 'experienced', 'consistent'],
      },
    }),
    prisma.masterTrader.create({
      data: {
        name: 'Pro Scalper',
        broker: 'BINANCE',
        winRate: 65.3,
        monthlyReturn: 22.1,
        followers: 156,
        riskLevel: 'HIGH',
        pnl: 8750.00,
        totalTrades: 89,
        isActive: true,
        description: 'High-frequency scalping strategy',
        tags: ['scalping', 'high-frequency', 'aggressive'],
      },
    }),
    prisma.masterTrader.create({
      data: {
        name: 'Conservative Trader',
        broker: 'BYBIT',
        winRate: 82.1,
        monthlyReturn: 8.5,
        followers: 320,
        riskLevel: 'LOW',
        pnl: 6200.00,
        totalTrades: 234,
        isActive: true,
        description: 'Low-risk, steady growth approach',
        tags: ['conservative', 'steady', 'low-risk'],
      },
    }),
  ]);

  console.log('✅ Created sample master traders');

  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📊 Sample data created:');
  console.log(`   👤 User: ${user.email}`);
  console.log(`   📈 Master Accounts: ${masterAccounts.length}`);
  console.log(`   📉 Follower Accounts: ${followerAccounts.length}`);
  console.log(`   🔗 Subscriptions: ${subscriptions.length}`);
  console.log(`   💰 Trades: ${trades.length}`);
  console.log(`   📊 Positions: ${positions.length}`);
  console.log(`   📈 Market Data: ${marketData.length}`);
  console.log(`   🔔 Notifications: ${notifications.length}`);
  console.log(`   📊 Performance Metrics: ${performanceMetrics.length}`);
  console.log(`   👨‍💼 Master Traders: ${masterTraders.length}`);
  console.log('');
  console.log('🔑 Login credentials:');
  console.log(`   Email: ${user.email}`);
  console.log(`   Password: password123`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });