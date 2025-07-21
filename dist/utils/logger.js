"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const isProduction = process.env.NODE_ENV === 'production';
const logDir = isProduction ? '/tmp/logs' : path_1.default.join(process.cwd(), 'logs');
if (!fs_1.default.existsSync(logDir)) {
    fs_1.default.mkdirSync(logDir, { recursive: true });
}
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.prettyPrint());
const transports = [];
if (isProduction) {
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
    }), new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5,
    }));
}
else {
    transports.push(new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
    }), new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'combined.log'),
        maxsize: 5242880,
        maxFiles: 5,
    }), new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
    }));
}
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'copytrader-pro-api' },
    transports,
});
exports.logger = logger;
//# sourceMappingURL=logger.js.map