/**
 * Test script for azure__search_email tool
 */

import { AzureOAuthService } from '../src/services/azureOAuthService.js';
import { AzureAPIClient } from '../src/mcp-servers/azure/azure-client.js';
import { AzureTools } from '../src/mcp-servers/azure/azure-tools.js';
import { requireAzureToken } from './get-tokens.js';

async function testAzureSearchEmail() {
  console.log('🧪 Testing azure__search_email...\n');

  try {
    // Get Azure token from environment
    const accessToken = requireAzureToken();
    console.log('✅ Azure token found\n');

    // Initialize Azure services
    const azureOAuth = new AzureOAuthService();
    const azureClient = new AzureAPIClient({ 
      accessToken, 
      refreshToken: accessToken,
      azureOAuthService: azureOAuth 
    });
    
    const azureTools = new AzureTools(azureClient);

    // Test azure__search_email tool
    console.log('📍 Testing azure__search_email tool');
    try {
      const tools = azureTools.getTools();
      const emailSearchTool = tools.find(tool => tool.name === 'azure__search_email');
      
      if (emailSearchTool) {
        console.log('✅ Found azure__search_email tool');
        
        // Test with keyword search
        console.log('\n🔍 Testing with keyword: "meeting"');
        const result = await emailSearchTool.invoke({ query: 'meeting' });
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
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
          console.log('   No emails found for keyword "meeting"');
        }
        
        // Test with empty query to check validation
        console.log('\n🔍 Testing with empty query (should handle gracefully)');
        try {
          const emptyResult = await emailSearchTool.invoke({ query: '' });
          console.log('✅ Empty query handled gracefully');
          console.log(`   Result: ${emptyResult.substring(0, 100)}...`);
        } catch (error) {
          console.log(`⚠️ Empty query validation: ${error}`);
        }
        
      } else {
        console.error('❌ Could not find azure__search_email tool');
      }
    } catch (error) {
      console.error(`❌ azure__search_email failed: ${error}`);
    }

    console.log('\n🎉 azure__search_email testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testAzureSearchEmail().catch(console.error);