"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.notFound = exports.errorHandler = void 0;
const logger_1 = require("../utils/logger");
const errors_1 = require("../utils/errors");
const errorHandler = (error, req, res, next) => {
    let statusCode = 500;
    let message = 'Internal Server Error';
    let details = undefined;
    logger_1.logger.error('Error occurred:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
    });
    if (error instanceof errors_1.AppError) {
        statusCode = error.statusCode;
        message = error.message;
        details = error.details;
    }
    else if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation Error';
        details = error.message;
    }
    else if (error.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }
    else if (error.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired';
    }
    else if (error.name === 'PrismaClientKnownRequestError') {
        const prismaError = error;
        if (prismaError.code === 'P2002') {
            statusCode = 409;
            message = 'Resource already exists';
        }
        else if (prismaError.code === 'P2025') {
            statusCode = 404;
            message = 'Resource not found';
        }
    }
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'Internal Server Error';
        details = undefined;
    }
    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(details && { details }),
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
        },
        timestamp: new Date().toISOString(),
    });
};
exports.errorHandler = errorHandler;
const notFound = (req, res, next) => {
    const error = new errors_1.AppError(`Route ${req.originalUrl} not found`, 404);
    next(error);
};
exports.notFound = notFound;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map