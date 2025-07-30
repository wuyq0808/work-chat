const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

// Basic middleware for logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Hello World route
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Hello World - App Runner</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            margin: 50px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 90vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .container {
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          h1 { font-size: 3em; margin-bottom: 20px; }
          .info { margin: 20px 0; font-size: 1.1em; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Hello World!</h1>
          <div class="info">
            <p><strong>✅ App Runner is working!</strong></p>
            <p>Server Time: ${new Date().toISOString()}</p>
            <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
            <p>Port: ${port}</p>
            <p>Node Version: ${process.version}</p>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API endpoint
app.get('/api/hello', (req, res) => {
  res.json({
    message: 'Hello from App Runner!',
    timestamp: new Date().toISOString(),
    server: 'AWS App Runner'
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Hello World app listening on port ${port}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully');
  process.exit(0);
});