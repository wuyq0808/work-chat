/**
 * Test script for atlassian__confluence_get_latest_pages tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianConfluenceGetLatestPages() {
  console.log('🧪 Testing atlassian__confluence_get_latest_pages...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__confluence_get_latest_pages tool
    console.log('📍 Testing atlassian__confluence_get_latest_pages tool');
    try {
      const tools = atlassianTools.getTools();
      const confluenceTool = tools.find(tool => tool.name === 'atlassian__confluence_get_latest_pages');
      
      if (confluenceTool) {
        console.log('✅ Found atlassian__confluence_get_latest_pages tool');
        
        // Test with 14 days
        console.log('\n🔍 Testing with days: 14');
        const result = await confluenceTool.invoke({ 
          days: 14, 
          includeArchived: false 
        });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Count rows in CSV output
        const csvRows = result.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length > 1 ? csvRows.length - 1 : 0} pages (excluding header)`);
        
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
          console.log('   No pages found in the last 14 days');
        }
      } else {
        console.error('❌ Could not find atlassian__confluence_get_latest_pages tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__confluence_get_latest_pages failed: ${error}`);
    }

    console.log('\n🎉 atlassian__confluence_get_latest_pages testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianConfluenceGetLatestPages().catch(console.error);