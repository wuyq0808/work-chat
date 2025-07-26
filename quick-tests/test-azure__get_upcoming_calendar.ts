/**
 * Test script for azure__get_upcoming_calendar tool
 */

import { AzureOAuthService } from '../src/services/azureOAuthService.js';
import { AzureAPIClient } from '../src/mcp-servers/azure/azure-client.js';
import { AzureTools } from '../src/mcp-servers/azure/azure-tools.js';
import { requireAzureToken } from './get-tokens.js';

async function testAzureCalendar() {
  console.log('📅 Testing Azure Calendar Tool...\n');

  // Extract Azure token from COOKIES using utility
  const accessToken = requireAzureToken();
  const refreshToken = accessToken;

  try {
    // Initialize Azure services
    const azureClient = new AzureAPIClient({ 
      accessToken
    });
    
    const azureTools = new AzureTools(azureClient);
    const tools = azureTools.getTools();

    console.log(`🔧 Initialized ${tools.length} Azure tools`);

    // Find the calendar tool
    const calendarTool = tools.find(tool => tool.name === 'azure__get_upcoming_calendar');
    
    if (!calendarTool) {
      console.error('❌ Azure calendar tool not found');
      console.log('Available tools:', tools.map(t => t.name));
      return;
    }

    console.log('📅 Testing calendar tool');

    // Test different configurations to find the Yongqi/Jason meeting
    // Since it's a recurring series from Jun 23 - Dec 23, 2025, we need longer ranges
    const testConfigs = [
      {
        name: 'Next 7 days (default)',
        params: {}
      },
      {
        name: 'Next 60 days (to catch June series start)',
        params: { days: 60 }
      },
      {
        name: 'Next 90 days (through August)',
        params: { days: 90 }
      },
      {
        name: 'Next 180 days (through December)',
        params: { days: 180 }
      }
    ];

    for (const config of testConfigs) {
      console.log(`🧪 Testing: ${config.name}`);
      
      try {
        const result = await calendarTool.invoke(config.params);
        
        // Show first few lines to see the user header
        const lines = result.split('\n').filter(line => line.trim());
        console.log(`✅ First 3 lines of response:`);
        lines.slice(0, 3).forEach((line, i) => {
          console.log(`   ${i + 1}: ${line}`);
        });
        
        // Parse CSV to find the meeting (skip user header if present)
        const headerLineIndex = lines.findIndex(line => line.startsWith('id,subject'));
        const dataRows = headerLineIndex >= 0 ? lines.slice(headerLineIndex + 1) : lines.slice(1);
        
        console.log(`✅ Found ${dataRows.length} events for ${config.name}`);
        
      } catch (error) {
        console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
      }
      
      console.log('---'.repeat(20));
      console.log();
    }

    console.log('📊 Calendar tool test completed');

    console.log('✅ Azure calendar tool tested successfully');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error instanceof Error ? error.message : error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testAzureCalendar().catch(console.error);
}

export { testAzureCalendar };