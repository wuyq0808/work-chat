#!/usr/bin/env node

import dotenv from 'dotenv';
import { AzureOAuthService } from '../src/services/azureOAuthService.js';
import { AzureAPIClient } from '../src/mcp-servers/azure/azure-client.js';
import { AzureTools } from '../src/mcp-servers/azure/azure-tools.js';

// Load environment variables
dotenv.config();

async function testCombinedAzureTool() {
  console.log('📧📅 Testing Combined Azure Emails and Calendar Tool...\n');

  // Extract tokens from COOKIES
  const cookies = process.env.COOKIES;
  if (!cookies) {
    console.error('❌ No COOKIES found in environment');
    return;
  }

  const azureTokenMatch = cookies.match(/azure_token=([^;]+)/);
  if (!azureTokenMatch) {
    console.error('❌ No azure_token found in COOKIES');
    return;
  }

  const accessToken = azureTokenMatch[1];
  const refreshToken = accessToken;

  try {
    // Initialize Azure services
    const azureOAuth = new AzureOAuthService();
    const azureClient = new AzureAPIClient({ 
      accessToken, 
      refreshToken,
      azureOAuthService: azureOAuth 
    });
    
    const azureTools = new AzureTools(azureClient);
    const tools = azureTools.getTools();

    // Find the combined tool
    const combinedTool = tools.find(tool => tool.name === 'azure__get_emails_and_calendar');
    
    if (!combinedTool) {
      console.error('❌ Combined azure tool not found');
      console.log('Available tools:', tools.map(t => t.name));
      return;
    }

    console.log('🔧 Testing combined emails and calendar tool');

    // Test with default parameters
    console.log('📊 Testing with default parameters (14 days)...');
    const result = await combinedTool.invoke({});
    
    console.log('✅ Combined tool result:');
    console.log('=====================================');
    console.log(result);
    
    console.log('\n📊 Testing with custom parameters (7 days)...');
    const result2 = await combinedTool.invoke({ days: 7 });
    
    console.log('✅ Combined tool result (7 days):');
    console.log('=====================================');
    console.log(result2);

    console.log('\n✅ Combined Azure tool tested successfully');
    
  } catch (error) {
    console.error('💥 Test failed:', error instanceof Error ? error.message : error);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testCombinedAzureTool().catch(console.error);
}

export { testCombinedAzureTool };