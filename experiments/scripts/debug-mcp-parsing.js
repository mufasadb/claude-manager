const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function debugMCPParsing() {
  try {
    const { stdout } = await execAsync('claude mcp list');
    
    console.log('Raw output:');
    console.log('='.repeat(50));
    console.log(stdout);
    console.log('='.repeat(50));
    
    console.log('\nSplit lines:');
    const lines = stdout.split('\n');
    lines.forEach((line, index) => {
      console.log(`${index}: "${line}"`);
    });
    
    console.log('\nFiltered lines (includes ✓ Connected):');
    const filteredLines = lines.filter(line => 
      line.includes('✓ Connected') && !line.includes('Checking MCP server health')
    );
    filteredLines.forEach((line, index) => {
      console.log(`${index}: "${line}"`);
    });
    
    console.log('\nParsing each line:');
    filteredLines.forEach(line => {
      const match = line.match(/^([^:]+):\s*(.+?)\s*-\s*(✓|✗)\s*(Connected|Failed|.*)/);
      if (match) {
        const [, name, commandPart, statusIcon, statusText] = match;
        console.log(`Name: "${name}"`);
        console.log(`Command part: "${commandPart}"`);
        console.log(`Status: "${statusIcon}" "${statusText}"`);
        
        const commandTokens = commandPart.trim().split(/\s+/);
        console.log(`Command tokens: ${JSON.stringify(commandTokens)}`);
        console.log('---');
      } else {
        console.log(`No match for: "${line}"`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugMCPParsing();