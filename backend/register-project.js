#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const http = require('http');

async function registerProject() {
  const currentDir = process.cwd();
  const packageJsonPath = path.join(currentDir, 'package.json');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  let statusDisplay = null;
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Claude Manager Project Registration

Usage: cm-reg [options]

Options:
  -s, --status-display <text>  Set status line display for this project (URL, description, etc.)
  -h, --help                   Show this help message

Examples:
  cm-reg                                           # Register project with default dashboard URL
  cm-reg --status-display http://localhost:3000   # Register project with custom interface URL
  cm-reg -s "My App Dev Server"                    # Register with custom description
  cm-reg -s http://localhost:8080                  # Short form with URL
`);
    return;
  }
  
  // Look for --status-display argument
  const statusDisplayIndex = args.findIndex(arg => arg === '--status-display' || arg === '-s');
  if (statusDisplayIndex !== -1 && args[statusDisplayIndex + 1]) {
    statusDisplay = args[statusDisplayIndex + 1];
  }
  
  // Get project name from package.json or directory name
  let projectName;
  try {
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      projectName = packageJson.name || path.basename(currentDir);
    } else {
      projectName = path.basename(currentDir);
    }
  } catch (error) {
    projectName = path.basename(currentDir);
  }

  // Register with Claude Manager
  const postData = JSON.stringify({
    name: projectName,
    path: currentDir,
    statusDisplay: statusDisplay
  });

  const options = {
    hostname: 'localhost',
    port: 3455,
    path: '/api/register-project',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  try {
    await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`✅ Successfully registered "${projectName}" with Claude Manager`);
            console.log(`   Path: ${currentDir}`);
            if (statusDisplay) {
              console.log(`   Status Display: ${statusDisplay}`);
            }
            console.log(`🌐 View dashboard: http://localhost:3455`);
            resolve();
          } else {
            try {
              const error = JSON.parse(data);
              console.error(`❌ Failed to register project: ${error.error}`);
            } catch {
              console.error(`❌ Failed to register project: HTTP ${res.statusCode}`);
            }
            console.log('   Make sure Claude Manager is running: npm start');
            reject(new Error('Registration failed'));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`❌ Could not connect to Claude Manager: ${error.message}`);
        console.log('   Start Claude Manager first: npm start');
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    // Error already logged above
  }
}

registerProject().catch(console.error);