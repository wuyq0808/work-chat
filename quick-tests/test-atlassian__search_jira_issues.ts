/**
 * Test script for atlassian__search_jira_issues tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianSearchJiraIssues() {
  console.log('🧪 Testing atlassian__search_jira_issues...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__search_jira_issues tool
    console.log('📍 Testing atlassian__search_jira_issues tool');
    try {
      const tools = atlassianTools.getTools();
      const searchTool = tools.find(tool => tool.name === 'atlassian__search_jira_issues');
      
      if (searchTool) {
        console.log('✅ Found atlassian__search_jira_issues tool');
        
        // Test with JQL query
        console.log('\n🔍 Testing with JQL query for recent issues');
        const result = await searchTool.invoke({ 
          jql: 'created >= -30d ORDER BY created DESC',
          maxResults: 10
        });
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
          console.log('   No issues found for the query');
        }
      } else {
        console.error('❌ Could not find atlassian__search_jira_issues tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__search_jira_issues failed: ${error}`);
    }

    console.log('\n🎉 atlassian__search_jira_issues testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianSearchJiraIssues().catch(console.error);