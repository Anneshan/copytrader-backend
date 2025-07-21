# CopyTrader Pro Backend API

A comprehensive Node.js/Express backend API for the CopyTrader Pro platform, providing secure authentication, real-time trading data, and broker integrations.

## 🚀 Features

### Core API Features
- **RESTful API** with comprehensive endpoints
- **WebSocket support** for real-time updates
- **JWT authentication** with refresh tokens
- **PostgreSQL database** with Prisma ORM
- **Redis caching** for performance
- **Rate limiting** and security middleware
- **Comprehensive logging** with Winston
- **Health monitoring** and checks
- **Input validation** with Joi and express-validator

### Security Features
- **Helmet.js** for security headers
- **CORS** configuration
- **Password hashing** with bcrypt
- **API key encryption** for broker credentials
- **Session management** with database storage
- **Rate limiting** to prevent abuse
- **Input sanitization** and validation

### Monitoring & Observability
- **Health check endpoints** for Kubernetes
- **Performance monitoring** with response times
- **Error tracking** and logging
- **Database query logging**
- **WebSocket connection monitoring**

## 🛠️ Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Authentication**: JWT with refresh tokens
- **WebSocket**: ws library
- **Logging**: Winston
- **Validation**: Joi + express-validator
- **Testing**: Jest + Supertest
- **TypeScript**: Full type safety

## 📋 Prerequisites

- Node.js 18 or higher
- PostgreSQL 13 or higher
- Redis 6 or higher
- npm or yarn

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd server

# Install dependencies
npm install
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npm run migrate

# Seed the database (optional)
npm run db:seed
```

### 4. Start Development Server

```bash
# Start in development mode
npm run dev

# Or build and start production
npm run build
npm start
```

## 📁 Project Structure

```
server/
├── src/
│   ├── config/          # Database and Redis configuration
│   ├── middleware/      # Express middleware
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── utils/           # Utility functions
│   └── server.ts        # Main server file
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── migrations/      # Database migrations
├── scripts/             # Utility scripts
├── logs/               # Application logs
└── tests/              # Test files
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Broker Accounts
- `GET /api/accounts` - List user's broker accounts
- `POST /api/accounts` - Add new broker account
- `PUT /api/accounts/:id` - Update broker account
- `DELETE /api/accounts/:id` - Delete broker account
- `POST /api/accounts/:id/validate` - Validate API credentials

### Subscriptions
- `GET /api/subscriptions` - List copy trading subscriptions
- `POST /api/subscriptions` - Create new subscription
- `PUT /api/subscriptions/:id` - Update subscription
- `DELETE /api/subscriptions/:id` - Delete subscription

### Trading
- `GET /api/trading/trades` - Get trade history
- `GET /api/trading/positions` - Get current positions
- `GET /api/trading/performance` - Get performance metrics
- `GET /api/trading/masters` - List available master traders

### Analytics
- `GET /api/analytics/dashboard` - Dashboard metrics
- `GET /api/analytics/performance` - Performance analytics
- `GET /api/analytics/reports` - Generate reports

### Health Checks
- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health information
- `GET /api/health/ready` - Readiness probe (Kubernetes)
- `GET /api/health/live` - Liveness probe (Kubernetes)

## 🔌 WebSocket Events

### Client to Server
- `auth` - Authenticate WebSocket connection
- `subscribe` - Subscribe to data channels
- `unsubscribe` - Unsubscribe from channels
- `ping` - Connection health check

### Server to Client
- `welcome` - Connection established
- `auth_success` - Authentication successful
- `initial_data` - Initial account and trade data
- `trade_update` - Real-time trade updates
- `account_update` - Account balance updates
- `market_data` - Market price updates
- `pong` - Response to ping

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.ts
```

## 📊 Monitoring

### Health Checks

```bash
# Run health check script
npm run health-check

# Check specific endpoint
curl http://localhost:5000/api/health

# Detailed health information
curl http://localhost:5000/api/health/detailed
```

### Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output in development

### Performance Monitoring

The API includes built-in performance monitoring:
- Response time tracking
- Database query performance
- Memory usage monitoring
- WebSocket connection tracking

## 🔒 Security

### Authentication Flow
1. User registers/logs in with email/password
2. Server returns JWT access token + refresh token
3. Access token used for API requests (7-day expiry)
4. Refresh token used to get new access tokens (30-day expiry)
5. Sessions stored in database for security

### API Key Security
- Broker API keys encrypted with AES-256
- Keys never logged or exposed in responses
- Secure key validation before storage

### Rate Limiting
- 100 requests per 15-minute window per IP
- Configurable via environment variables
- Different limits for different endpoints

## 🚀 Deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t copytrader-pro-api .

# Run with Docker Compose
docker-compose up -d
```

### Environment Variables

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `ENCRYPTION_KEY` - API key encryption key

### Health Checks for Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 5000
  initialDelaySeconds: 5
  periodSeconds: 5
```

## 🔧 Configuration

### Database Configuration
- Connection pooling enabled
- Query logging in development
- Automatic migrations on startup
- Health check monitoring

### Redis Configuration
- Connection retry logic
- Automatic failover
- Cache TTL configuration
- Health monitoring

### WebSocket Configuration
- Automatic reconnection
- Ping/pong health checks
- Message queuing
- Connection limits

## 📈 Performance

### Optimization Features
- Database query optimization
- Redis caching for frequent queries
- Connection pooling
- Compression middleware
- Response time monitoring

### Scaling Considerations
- Stateless design for horizontal scaling
- Redis for shared session storage
- Database read replicas support
- Load balancer ready

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Verify connection string
   psql $DATABASE_URL
   ```

2. **Redis Connection Failed**
   ```bash
   # Check Redis status
   sudo systemctl status redis
   
   # Test connection
   redis-cli ping
   ```

3. **JWT Token Issues**
   ```bash
   # Verify JWT_SECRET is set
   echo $JWT_SECRET
   
   # Check token expiration
   curl -H "Authorization: Bearer <token>" http://localhost:5000/api/auth/profile
   ```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Enable Prisma query logging
DEBUG=prisma:query npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📞 Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Security**: security@copytrader.pro
- **General**: support@copytrader.pro