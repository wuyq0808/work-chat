/**
 * Test script for atlassian__get_latest_activity tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianGetLatestActivity() {
  console.log('🧪 Testing atlassian__get_latest_activity...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__get_latest_activity tool
    console.log('📍 Testing atlassian__get_latest_activity tool');
    try {
      const tools = atlassianTools.getTools();
      const getLatestActivityTool = tools.find(tool => tool.name === 'atlassian__get_latest_activity');
      
      if (getLatestActivityTool) {
        console.log('✅ Found atlassian__get_latest_activity tool');
        
        // Test with 7 days
        console.log('\n🔍 Testing with days: 7');
        const result = await getLatestActivityTool.invoke({ days: 7 });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Count rows in CSV output
        const csvRows = result.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length > 1 ? csvRows.length - 1 : 0} activities (excluding header)`);
        
        // Show sample of the result
        if (result.length > 0) {
          const lines = result.split('\n');
          const sampleLines = lines.slice(0, 10);
          console.log(`   Sample output (first 10 lines):`);
          sampleLines.forEach((line, i) => {
            console.log(`     ${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
          });
          
          if (lines.length > 10) {
            console.log(`     ... (${lines.length - 10} more lines)`);
          }
        } else {
          console.log('   No activities found in the last 7 days');
        }
      } else {
        console.error('❌ Could not find atlassian__get_latest_activity tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__get_latest_activity failed: ${error}`);
    }

    console.log('\n🎉 atlassian__get_latest_activity testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianGetLatestActivity().catch(console.error);