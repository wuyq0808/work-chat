/**
 * Test script for atlassian__get_user_latest_issues tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianGetUserLatestIssues() {
  console.log('🧪 Testing atlassian__get_user_latest_issues...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__get_user_latest_issues tool
    console.log('📍 Testing atlassian__get_user_latest_issues tool');
    try {
      const tools = atlassianTools.getTools();
      const getUserLatestIssuesTool = tools.find(tool => tool.name === 'atlassian__get_user_latest_issues');
      
      if (getUserLatestIssuesTool) {
        console.log('✅ Found atlassian__get_user_latest_issues tool');
        
        // Test with 30 days
        console.log('\n🔍 Testing with days: 30');
        const result = await getUserLatestIssuesTool.invoke({ days: 30 });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Parse CSV and show details
        const lines = result.split('\n');
        const header = lines[0];
        console.log(`   Header: ${header}`);
        
        const csvRows = lines.filter(row => row.trim());
        console.log(`   Found ${csvRows.length > 1 ? csvRows.length - 1 : 0} issues (excluding header)`);
        
        // Show sample of the result with epic information
        if (csvRows.length > 1) {
          console.log(`   Sample issues with epic details:`);
          for (let i = 1; i <= Math.min(5, csvRows.length - 1); i++) {
            if (csvRows[i].trim()) {
              const columns = csvRows[i].split(',');
              const key = columns[0];
              const summary = columns[1]?.replace(/"/g, '') || '';
              const status = columns[2]?.replace(/"/g, '') || '';
              const epicKey = columns[8]?.replace(/"/g, '') || '';
              const epicSummary = columns[9]?.replace(/"/g, '') || '';
              
              console.log(`     ${i}. ${key}: ${summary.substring(0, 40)}...`);
              console.log(`        Status: ${status}`);
              if (epicKey) {
                console.log(`        Epic: ${epicKey} - ${epicSummary.substring(0, 30)}...`);
              } else {
                console.log(`        Epic: None`);
              }
            }
          }
          
          if (csvRows.length > 6) {
            console.log(`     ... (${csvRows.length - 6} more issues)`);
          }
        } else {
          console.log('   No issues found in the last 30 days');
        }
      } else {
        console.error('❌ Could not find atlassian__get_user_latest_issues tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__get_user_latest_issues failed: ${error}`);
    }

    console.log('\n🎉 atlassian__get_user_latest_issues testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianGetUserLatestIssues().catch(console.error);