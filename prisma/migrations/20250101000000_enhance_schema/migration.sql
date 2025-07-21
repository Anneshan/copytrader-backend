-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TRADE_EXECUTED', 'ACCOUNT_SYNC', 'SUBSCRIPTION_UPDATE', 'SYSTEM_ALERT', 'PERFORMANCE_UPDATE', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "broker_accounts" ADD COLUMN "passphrase" TEXT,
ADD COLUMN "winRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalTrades" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "followers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "monthlyReturn" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "winRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "monthlyReturn" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "trades" ADD COLUMN "executionTime" INTEGER,
ADD COLUMN "slippage" DECIMAL(10,4),
ADD COLUMN "fees" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "positions" ADD COLUMN "percentage" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "market_data" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "bid" DECIMAL(20,8),
    "ask" DECIMAL(20,8),
    "volume" DECIMAL(20,8),
    "change24h" DECIMAL(10,2),
    "volume24h" DECIMAL(20,8),
    "spread" DECIMAL(10,4),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "totalPnL" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "winRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "avgTradeSize" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "maxDrawdown" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sharpeRatio" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthlyReturn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bestTrade" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "worstTrade" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_traders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "broker" "Broker" NOT NULL,
    "winRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthlyReturn" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "pnl" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_traders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_data_accountId_symbol_timestamp_key" ON "market_data"("accountId", "symbol", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "performance_metrics_userId_accountId_date_key" ON "performance_metrics"("userId", "accountId", "date");

-- AddForeignKey
ALTER TABLE "market_data" ADD CONSTRAINT "market_data_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "broker_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; 