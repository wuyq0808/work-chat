/**
 * Test script for atlassian__jira_get_latest_issues tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianJiraGetLatestIssues() {
  console.log('🧪 Testing atlassian__jira_get_latest_issues...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__jira_get_latest_issues tool
    console.log('📍 Testing atlassian__jira_get_latest_issues tool');
    try {
      const tools = atlassianTools.getTools();
      const jiraTool = tools.find(tool => tool.name === 'atlassian__jira_get_latest_issues');
      
      if (jiraTool) {
        console.log('✅ Found atlassian__jira_get_latest_issues tool');
        
        // Test with 7 days
        console.log('\n🔍 Testing with days: 7');
        const result = await jiraTool.invoke({ days: 7 });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Count rows in CSV output
        const csvRows = result.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length > 1 ? csvRows.length - 1 : 0} issues (excluding header)`);
        
        // Show sample of the result
        if (result.length > 0) {
          const lines = result.split('\n');
          const sampleLines = lines.slice(0, 5);
          console.log(`   Sample output (first 5 lines):`);
          sampleLines.forEach((line, i) => {
            console.log(`     ${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
          });
          
          if (lines.length > 5) {
            console.log(`     ... (${lines.length - 5} more lines)`);
          }
        } else {
          console.log('   No issues found in the last 7 days');
        }
      } else {
        console.error('❌ Could not find atlassian__jira_get_latest_issues tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__jira_get_latest_issues failed: ${error}`);
    }

    console.log('\n🎉 atlassian__jira_get_latest_issues testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianJiraGetLatestIssues().catch(console.error);