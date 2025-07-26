/**
 * Test script for atlassian__search_confluence_spaces tool
 */

import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testAtlassianSearchConfluenceSpaces() {
  console.log('🧪 Testing atlassian__search_confluence_spaces...\n');

  try {
    // Get Atlassian token from environment
    const accessToken = requireAtlassianToken();
    console.log('✅ Atlassian token found\n');

    // Initialize Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);

    // Test atlassian__search_confluence_spaces tool
    console.log('📍 Testing atlassian__search_confluence_spaces tool');
    try {
      const tools = atlassianTools.getTools();
      const searchSpacesTool = tools.find(tool => tool.name === 'atlassian__search_confluence_spaces');
      
      if (searchSpacesTool) {
        console.log('✅ Found atlassian__search_confluence_spaces tool');
        
        // Test with query for spaces
        console.log('\n🔍 Testing space search');
        const result = await searchSpacesTool.invoke({ 
          query: '',
          limit: 10
        });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Count rows in CSV output
        const csvRows = result.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length > 1 ? csvRows.length - 1 : 0} spaces (excluding header)`);
        
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
          console.log('   No spaces found');
        }
      } else {
        console.error('❌ Could not find atlassian__search_confluence_spaces tool');
      }
    } catch (error) {
      console.error(`❌ atlassian__search_confluence_spaces failed: ${error}`);
    }

    console.log('\n🎉 atlassian__search_confluence_spaces testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAtlassianSearchConfluenceSpaces().catch(console.error);