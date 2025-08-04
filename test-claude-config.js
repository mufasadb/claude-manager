const ClaudeConfigReader = require('./backend/services/claude-config-reader');

async function testClaudeConfigReader() {
  const reader = new ClaudeConfigReader();
  
  console.log('🔍 Reading actual Claude MCP configuration...\n');
  
  // Get actual MCPs
  const actualMCPs = await reader.getActualMCPConfiguration();
  
  if (actualMCPs.success) {
    console.log('✅ Successfully extracted MCP configuration from Claude');
    console.log(`📊 Found ${actualMCPs.totalCount} MCPs\n`);
    
    Object.keys(actualMCPs.mcps).forEach(name => {
      const mcp = actualMCPs.mcps[name];
      console.log(`🔌 ${mcp.name}`);
      console.log(`   Command: ${mcp.command}`);
      console.log(`   Args: ${JSON.stringify(mcp.args)}`);
      console.log(`   Transport: ${mcp.transport}`);
      console.log(`   Status: ${mcp.status} (${mcp.statusMessage})`);
      console.log(`   Source: ${mcp.source}`);
      if (Object.keys(mcp.env).length > 0) {
        console.log(`   Env Variables: ${Object.keys(mcp.env).join(', ')}`);
      }
      console.log('');
    });
  } else {
    console.log('❌ Failed to read MCP configuration:', actualMCPs.error);
    return;
  }
  
  console.log('\n🔄 Syncing with Claude Manager configuration...\n');
  
  // Test sync functionality
  const syncResult = await reader.syncWithClaudeManagerConfig();
  
  if (syncResult.success) {
    console.log('✅ Successfully synced configurations');
    console.log(`📊 Sync Results:`);
    console.log(`   Added: ${syncResult.syncResults.added.length} MCPs`);
    console.log(`   Updated: ${syncResult.syncResults.updated.length} MCPs`);
    console.log(`   Removed: ${syncResult.syncResults.removed.length} MCPs`);
    console.log(`   Conflicts: ${syncResult.syncResults.conflicts.length} MCPs`);
    
    if (syncResult.syncResults.added.length > 0) {
      console.log(`\n📝 Added MCPs: ${syncResult.syncResults.added.join(', ')}`);
    }
    
    if (syncResult.syncResults.conflicts.length > 0) {
      console.log(`\n⚠️  Conflicts detected:`);
      syncResult.syncResults.conflicts.forEach(conflict => {
        console.log(`   ${conflict.name}:`);
        console.log(`     Manager: ${conflict.manager.command} ${conflict.manager.args?.join(' ')}`);
        console.log(`     Claude:  ${conflict.claude.command} ${conflict.claude.args?.join(' ')}`);
      });
    }
  } else {
    console.log('❌ Failed to sync configurations:', syncResult.error);
  }
  
  console.log('\n📋 Generating comprehensive report...\n');
  
  // Generate report
  const reportResult = await reader.generateMCPReport();
  
  if (reportResult.success) {
    const report = reportResult.report;
    console.log('📊 MCP Configuration Report');
    console.log(`Generated: ${report.timestamp}`);
    console.log(`Total MCPs: ${report.summary.totalMCPs}`);
    console.log(`Added: ${report.summary.added}, Updated: ${report.summary.updated}, Removed: ${report.summary.removed}, Conflicts: ${report.summary.conflicts}`);
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }
  }
}

testClaudeConfigReader().catch(console.error);