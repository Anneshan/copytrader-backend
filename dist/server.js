"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
const auth_1 = __importDefault(require("./routes/auth"));
const accounts_1 = __importDefault(require("./routes/accounts"));
const health_1 = __importDefault(require("./routes/health"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '5000');
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: {
        error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger_1.logger.info(message.trim()),
    },
}));
app.use('/api/health', health_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/accounts', accounts_1.default);
app.get('/', (req, res) => {
    res.json({
        message: 'CopyTrader Pro API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
    });
});
app.get('/api', (req, res) => {
    res.json({
        message: 'CopyTrader Pro API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
    });
});
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
if (process.env.NODE_ENV !== 'production') {
    const startServer = async () => {
        try {
            logger_1.logger.info('Server initialized successfully');
            logger_1.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            app.listen(PORT, () => {
                logger_1.logger.info(`Server running on http://localhost:${PORT}`);
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    };
    startServer();
}
module.exports = app;
exports.default = app;
//# sourceMappingURL=server.js.map