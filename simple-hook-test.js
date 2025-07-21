#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * Simple test to verify if any hooks are working
 */

async function testHooks() {
  console.log('🧪 Testing hook execution...');
  
  // Test if Test hook exists and works
  const testLogPath = '/tmp/claude-test-hook.log';
  const stopLogPath = '/tmp/claude-stop.log';
  const subagentLogPath = '/Users/danielbeach/.claude-subagent-test.log';
  
  console.log('📄 Checking for existing hook log files...');
  
  const files = [
    { name: 'Test hook', path: testLogPath },
    { name: 'Stop hook', path: stopLogPath }, 
    { name: 'SubagentStop hook', path: subagentLogPath }
  ];
  
  for (const file of files) {
    if (await fs.pathExists(file.path)) {
      console.log(`✅ ${file.name} log found at ${file.path}`);
      const content = await fs.readFile(file.path, 'utf8');
      console.log(`   Content: ${content.trim()}`);
    } else {
      console.log(`❌ ${file.name} log not found at ${file.path}`);
    }
  }
  
  // Check Claude settings
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    console.log('📋 Claude settings hooks:');
    console.log(JSON.stringify(settings.hooks, null, 2));
  } else {
    console.log('❌ No Claude settings found');
  }
  
  // Create a simple test file to trigger a hook
  const testFile = path.join(__dirname, 'hook-test-file.txt');
  await fs.writeFile(testFile, 'This is a test file to trigger hooks');
  console.log('📁 Created test file:', testFile);
  
  // Clean up
  await fs.remove(testFile);
  console.log('🧹 Cleaned up test file');
}

testHooks().catch(console.error);