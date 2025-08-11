#!/usr/bin/env node

/**
 * Test script for the code-grapher MCP server
 * This script will test the functionality of the codegraph MCP server
 */

const { spawn } = require('child_process');
const path = require('path');

class CodeGraphTester {
    constructor() {
        this.mcpProcess = null;
        this.projectPath = '/Users/danielbeach/Code/claude-manager';
    }

    async startMCPServer() {
        console.log('🚀 Starting MCP Code Graph server...');
        
        this.mcpProcess = spawn('npx', [
            '-y',
            '@cartographai/mcp-server-codegraph',
            this.projectPath
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        return new Promise((resolve, reject) => {
            let output = '';
            
            this.mcpProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('MCP Output:', data.toString());
                
                // Check if server is ready
                if (output.includes('MCP Server CodeGraph running on stdio')) {
                    resolve();
                }
            });

            this.mcpProcess.stderr.on('data', (data) => {
                console.error('MCP Error:', data.toString());
            });

            this.mcpProcess.on('error', (error) => {
                reject(error);
            });

            // Timeout after 10 seconds
            setTimeout(() => {
                reject(new Error('MCP server startup timeout'));
            }, 10000);
        });
    }

    async sendRequest(method, params = {}) {
        if (!this.mcpProcess) {
            throw new Error('MCP server not started');
        }

        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };

        console.log(`📤 Sending request: ${method}`, params);
        
        this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request ${method} timed out`));
            }, 30000);

            const onData = (data) => {
                clearTimeout(timeout);
                const response = data.toString();
                console.log(`📥 Response for ${method}:`, response);
                
                try {
                    const parsed = JSON.parse(response);
                    resolve(parsed);
                } catch (e) {
                    resolve({ raw: response });
                }
                
                this.mcpProcess.stdout.off('data', onData);
            };

            this.mcpProcess.stdout.on('data', onData);
        });
    }

    async testIndexing() {
        console.log('\n🔍 Testing codebase indexing...');
        try {
            const result = await this.sendRequest('tools/call', {
                name: 'index',
                arguments: {}
            });
            console.log('✅ Indexing completed:', result);
            return result;
        } catch (error) {
            console.error('❌ Indexing failed:', error.message);
            throw error;
        }
    }

    async testListFileEntities() {
        console.log('\n📋 Testing file entities listing...');
        try {
            // Test with a known file in the repository
            const result = await this.sendRequest('tools/call', {
                name: 'list_file_entities',
                arguments: {
                    path: 'backend/claude-manager.js'
                }
            });
            console.log('✅ File entities listed:', result);
            return result;
        } catch (error) {
            console.error('❌ File entities listing failed:', error.message);
            throw error;
        }
    }

    async testEntityRelationships() {
        console.log('\n🔗 Testing entity relationships...');
        try {
            // Test with a known function
            const result = await this.sendRequest('tools/call', {
                name: 'list_entity_relationships',
                arguments: {
                    path: 'backend/claude-manager.js',
                    name: 'ClaudeManager'
                }
            });
            console.log('✅ Entity relationships listed:', result);
            return result;
        } catch (error) {
            console.error('❌ Entity relationships failed:', error.message);
            throw error;
        }
    }

    async runTests() {
        const results = {
            serverStart: false,
            indexing: false,
            fileEntities: false,
            entityRelationships: false,
            errors: []
        };

        try {
            // Start MCP server
            console.log('='.repeat(50));
            console.log('🧪 Starting Code Graph MCP Server Tests');
            console.log('='.repeat(50));
            
            await this.startMCPServer();
            results.serverStart = true;
            console.log('✅ MCP server started successfully');

            // Test indexing
            await this.testIndexing();
            results.indexing = true;

            // Test file entities
            await this.testListFileEntities();
            results.fileEntities = true;

            // Test entity relationships
            await this.testEntityRelationships();
            results.entityRelationships = true;

        } catch (error) {
            console.error('❌ Test failed:', error.message);
            results.errors.push(error.message);
        } finally {
            // Cleanup
            if (this.mcpProcess) {
                console.log('\n🧹 Cleaning up MCP server...');
                this.mcpProcess.kill();
            }
        }

        return results;
    }

    cleanup() {
        if (this.mcpProcess) {
            this.mcpProcess.kill();
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new CodeGraphTester();
    
    // Handle cleanup on exit
    process.on('SIGINT', () => {
        console.log('\n🛑 Received SIGINT, cleaning up...');
        tester.cleanup();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Received SIGTERM, cleaning up...');
        tester.cleanup();
        process.exit(0);
    });

    tester.runTests().then(results => {
        console.log('\n' + '='.repeat(50));
        console.log('📊 Test Results Summary');
        console.log('='.repeat(50));
        console.log('Server Start:', results.serverStart ? '✅' : '❌');
        console.log('Indexing:', results.indexing ? '✅' : '❌');
        console.log('File Entities:', results.fileEntities ? '✅' : '❌');
        console.log('Entity Relationships:', results.entityRelationships ? '✅' : '❌');
        console.log('Errors:', results.errors.length);
        
        if (results.errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            results.errors.forEach((error, i) => {
                console.log(`  ${i + 1}. ${error}`);
            });
        }

        const successCount = Object.values(results).filter(v => v === true).length;
        const totalTests = 4; // serverStart, indexing, fileEntities, entityRelationships
        
        console.log(`\n📈 Overall: ${successCount}/${totalTests} tests passed`);
        process.exit(results.errors.length > 0 ? 1 : 0);
    }).catch(error => {
        console.error('❌ Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = CodeGraphTester;