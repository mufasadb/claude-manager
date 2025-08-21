#!/usr/bin/env node

/**
 * Suggest Bun Instead of NPM Hook
 * 
 * This hook demonstrates using enhanced command details to detect npm commands
 * and suggest using bun instead for better performance.
 * 
 * Triggers: PreToolUse events for Bash tools
 * Action: Detects npm commands and suggests bun alternatives
 */

const hookName = 'suggest-bun';

// Parse the hook event data from the hook system
const eventData = JSON.parse(process.argv[2] || '{}');

console.log(`[Hook:${hookName}:info] === BASH COMMAND ANALYSIS ===`);
console.log(`[Hook:${hookName}:info] Tool: ${eventData.toolName}`);

// Check if this is a Bash tool with command details
if (eventData.toolName === 'Bash' && eventData.commandDetails) {
    const { fullCommand, detectedPatterns, npmSubCommand, commandArgs } = eventData.commandDetails;
    
    console.log(`[Hook:${hookName}:info] Command: ${fullCommand}`);
    console.log(`[Hook:${hookName}:info] Detected patterns: ${detectedPatterns.join(', ')}`);
    
    // Check for npm commands
    if (detectedPatterns.includes('npm_command')) {
        console.log(`[Hook:${hookName}:warn] 🚨 NPM COMMAND DETECTED!`);
        console.log(`[Hook:${hookName}:warn] NPM subcommand: ${npmSubCommand}`);
        
        // Suggest bun alternatives for common npm commands
        const bunAlternatives = {
            'install': 'bun install',
            'i': 'bun install',
            'run': 'bun run',
            'start': 'bun start',
            'test': 'bun test',
            'build': 'bun run build',
            'dev': 'bun dev',
            'create': 'bun create',
            'add': 'bun add',
            'remove': 'bun remove'
        };
        
        const suggestion = bunAlternatives[npmSubCommand];
        if (suggestion) {
            console.log(`[Hook:${hookName}:suggestion] Consider using: ${suggestion}`);
            console.log(`[Hook:${hookName}:suggestion] Bun is faster and more efficient than npm!`);
            
            // For demonstration - you could potentially block the command here
            // by exiting with code 1, but we'll just suggest for now
            
        } else {
            console.log(`[Hook:${hookName}:suggestion] Consider using bun instead of npm for better performance`);
        }
        
        // Log the detection for analytics
        console.log(`[Hook:${hookName}:analytics] NPM usage detected: ${fullCommand}`);
    }
    
    // Check for other package managers
    else if (detectedPatterns.includes('yarn_command')) {
        console.log(`[Hook:${hookName}:info] Yarn command detected - consider bun for even better performance`);
    }
    
    else if (detectedPatterns.includes('bun_command')) {
        console.log(`[Hook:${hookName}:info] ✅ Great choice using bun!`);
    }
    
    // Check for dangerous commands
    if (detectedPatterns.includes('dangerous_command')) {
        console.log(`[Hook:${hookName}:error] WARNING: DANGEROUS COMMAND DETECTED: ${fullCommand}`);
        console.log(`[Hook:${hookName}:error] Please review this command carefully before proceeding`);
    }
}

console.log(`[Hook:${hookName}:info] Hook analysis complete`);

// Always exit successfully to not block Claude Code
process.exit(0);