require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ClaudeManager = require('./claude-manager');

// Create and initialize the manager
const manager = new ClaudeManager();
manager.init().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
  manager.shutdown().then(() => process.exit(0));
});

module.exports = ClaudeManager;