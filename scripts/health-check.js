#!/usr/bin/env node

const http = require('http');
const https = require('https');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

const HEALTH_ENDPOINTS = [
  '/api/health',
  '/api/health/ready',
  '/api/health/live',
];

const checkEndpoint = (url) => {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const start = Date.now();
    
    const req = client.get(url, (res) => {
      const duration = Date.now() - start;
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          resolve({
            url,
            status: res.statusCode,
            duration,
            success: res.statusCode >= 200 && res.statusCode < 300,
            data,
          });
        } catch (error) {
          resolve({
            url,
            status: res.statusCode,
            duration,
            success: false,
            error: 'Invalid JSON response',
          });
        }
      });
    });

    req.on('error', (error) => {
      const duration = Date.now() - start;
      resolve({
        url,
        status: 0,
        duration,
        success: false,
        error: error.message,
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        url,
        status: 0,
        duration: 10000,
        success: false,
        error: 'Timeout',
      });
    });
  });
};

const runHealthCheck = async () => {
  console.log('🏥 Running API health checks...\n');
  
  const results = await Promise.all(
    HEALTH_ENDPOINTS.map(endpoint => checkEndpoint(`${API_BASE_URL}${endpoint}`))
  );

  let allHealthy = true;

  results.forEach((result) => {
    const status = result.success ? '✅' : '❌';
    const duration = `${result.duration}ms`;
    
    console.log(`${status} ${result.url}`);
    console.log(`   Status: ${result.status || 'N/A'}`);
    console.log(`   Duration: ${duration}`);
    
    if (result.data) {
      console.log(`   Response: ${JSON.stringify(result.data, null, 2)}`);
    }
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    
    console.log('');
    
    if (!result.success) {
      allHealthy = false;
    }
  });

  if (allHealthy) {
    console.log('🎉 All health checks passed!');
    process.exit(0);
  } else {
    console.log('💥 Some health checks failed!');
    process.exit(1);
  }
};

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node health-check.js [options]

Options:
  --help, -h     Show this help message
  
Environment Variables:
  API_BASE_URL   Base URL for the API (default: http://localhost:5000)

Examples:
  node health-check.js
  API_BASE_URL=https://api.example.com node health-check.js
  `);
  process.exit(0);
}

runHealthCheck().catch((error) => {
  console.error('Health check script failed:', error);
  process.exit(1);
});