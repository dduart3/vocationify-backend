import { app } from './app';
import { config } from './config/environment';
import { testDBConnection } from './config/database';

const startServer = async () => {
  try {
    // Test database connection
    console.log('🔍 Testing database connection...');
    await testDBConnection();
    console.log('✅ Database connection successful');

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`🚀 Vocationify API Server running on port ${config.port}`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`🌐 CORS Origin: ${config.cors.origin}`);
      console.log(`📊 Database: ${config.database.url ? 'Connected' : 'Not configured'}`);
      
      if (config.nodeEnv === 'development') {
        console.log(`\n📋 Available endpoints:`);
        console.log(`   GET  /                     - API info`);
        console.log(`   GET  /api/health           - Health check`);
        console.log(`   POST /api/sessions         - Create session`);
        console.log(`   GET  /api/sessions         - Get session`);
        console.log(`   POST /api/sessions/complete - Complete session`);
        console.log(`   GET  /api/questions/:id/next - Get next question`);
        console.log(`   POST /api/questions/response - Submit response`);
        console.log(`   GET  /api/results/:id      - Get results`);
        console.log(`   GET  /api/results/:id/detailed - Get detailed results\n`);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.log('❌ Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();
