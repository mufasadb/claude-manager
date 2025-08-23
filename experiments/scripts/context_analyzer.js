#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple JSONL context analyzer
function analyzeContext(jsonlPath) {
    const lines = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n');
    
    let totalTokens = {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0
    };
    
    let messageTokens = 0;
    let toolUseTokens = 0;
    
    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            
            if (entry.message && entry.message.usage) {
                const usage = entry.message.usage;
                totalTokens.input += usage.input_tokens || 0;
                totalTokens.output += usage.output_tokens || 0;
                totalTokens.cacheCreation += usage.cache_creation_input_tokens || 0;
                totalTokens.cacheRead += usage.cache_read_input_tokens || 0;
                
                // Count message tokens (rough estimate)
                if (entry.type === 'user' || entry.type === 'assistant') {
                    messageTokens += usage.input_tokens || 0;
                    messageTokens += usage.output_tokens || 0;
                }
                
                // Tool use detection
                if (entry.message.content && Array.isArray(entry.message.content)) {
                    const hasToolUse = entry.message.content.some(c => c.type === 'tool_use' || c.type === 'tool_result');
                    if (hasToolUse) {
                        toolUseTokens += usage.output_tokens || 0;
                    }
                }
            }
        } catch (e) {
            // Skip malformed lines
        }
    }
    
    console.log('Token Analysis:');
    console.log(`Input tokens: ${totalTokens.input}`);
    console.log(`Output tokens: ${totalTokens.output}`);
    console.log(`Cache creation: ${totalTokens.cacheCreation}`);
    console.log(`Cache read: ${totalTokens.cacheRead}`);
    console.log(`Estimated message tokens: ${messageTokens}`);
    console.log(`Estimated tool use tokens: ${toolUseTokens}`);
    
    // The cache_creation likely includes system prompt, tools, memory files on first load
    // The cache_read is reading those cached items
    // Input/output is the actual conversation
    
    return {
        total: totalTokens.input + totalTokens.output + totalTokens.cacheCreation,
        breakdown: totalTokens,
        estimates: {
            messages: messageTokens,
            toolUse: toolUseTokens,
            systemContext: totalTokens.cacheCreation
        }
    };
}

// Run with current session file
const sessionFile = process.argv[2] || '~/.claude/projects/-Users-danielbeach-Code-claude-manager/8b0af382-5664-405d-9892-8586858b123b.jsonl';
const expandedPath = sessionFile.replace('~', process.env.HOME);

if (fs.existsSync(expandedPath)) {
    analyzeContext(expandedPath);
} else {
    console.log('File not found:', expandedPath);
}