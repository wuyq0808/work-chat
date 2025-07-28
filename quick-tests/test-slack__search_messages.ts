/**
 * Test script for slack__search_messages tool
 * Tests the updated tool with separated query and user parameters
 */

import { SlackAPIClient } from '../src/mcp-servers/slack/slack-client.js';
import { SlackTools } from '../src/mcp-servers/slack/slack-tools.js';
import { requireSlackToken } from './get-tokens.js';

async function testSlackSearchMessages() {
  console.log('🧪 Testing slack__search_messages...\n');

  try {
    // Get Slack token from environment
    const slackToken = requireSlackToken();
    console.log('✅ Slack token found\n');

    // Initialize Slack client and tools
    const slackClient = new SlackAPIClient(slackToken);
    const slackTools = new SlackTools(slackClient);

    // Test slack__search_messages tool
    console.log('📍 Testing slack__search_messages tool');
    try {
      const tools = slackTools.getTools();
      const searchTool = tools.find(tool => tool.name === 'slack__search_messages');
      
      if (searchTool) {
        console.log('✅ Found slack__search_messages tool');
        
        // Test 1: Basic query search
        console.log('\n🔍 Test 1: Basic query search');
        const result1 = await searchTool.invoke({ 
          query: 'meeting',
          count: 5
        });
        console.log('✅ Basic query executed successfully');
        console.log(`   Result length: ${result1.length} characters`);
        if (result1.length > 0) {
          const lines = result1.split('\n');
          console.log(`   Found ${lines.length > 1 ? lines.length - 1 : 0} messages (excluding header)`);
          console.log(`   Sample first line: ${lines[1]?.substring(0, 100)}...`);
        }

        // Test 2: First let's see what users appear in basic search
        console.log('\n🔍 Test 2a: Check what users exist in recent messages');
        const basicResult = await searchTool.invoke({ 
          query: 'test',
          count: 10
        });
        console.log('✅ Basic search executed');
        
        const basicLines = basicResult.split('\n');
        console.log(`   Found ${basicLines.length > 1 ? basicLines.length - 1 : 0} messages`);
        
        // Extract unique usernames from the results
        const usernames = new Set<string>();
        for (let i = 1; i < Math.min(basicLines.length, 6); i++) {
          const line = basicLines[i];
          if (line.trim()) {
            const firstComma = line.indexOf(',');
            if (firstComma > 0) {
              const username = line.substring(0, firstComma);
              usernames.add(username);
              console.log(`   Message ${i}: From ${username}: ${line.substring(firstComma + 1, firstComma + 50)}...`);
            }
          }
        }
        
        console.log(`   Available users: ${Array.from(usernames).join(', ')}`);
        
        // Test 2b: Try with your actual username  
        console.log(`\n🔍 Test 2b: Testing user filter with your username: 'Yongqi Wu'`);
        
        const result2 = await searchTool.invoke({ 
          query: '',
          user: 'Yongqi Wu',
          count: 10
        });
        
        console.log(`   Result length: ${result2.length} characters`);
        console.log('\n📋 RAW RESULT for Yongqi Wu:');
        console.log('================');
        console.log(result2);
        console.log('================');
        
        // Also test with an existing user for comparison
        if (usernames.size > 0) {
          const testUser = Array.from(usernames)[0];
          console.log(`\n🔍 Test 2c: Testing with existing user for comparison: ${testUser}`);
          
          const result3 = await searchTool.invoke({ 
            query: '',
            user: testUser,
            count: 5
          });
          
          console.log(`   Result length: ${result3.length} characters`);
          if (result3.length > 50) {
            console.log('\n📋 RAW RESULT for comparison user:');
            console.log('================');
            console.log(result3);
            console.log('================');
          }
        }

        // Test 3: Query with multiple filters
        console.log('\n🔍 Test 3: Query with multiple filters (user + channel)');
        const result3 = await searchTool.invoke({ 
          query: 'test',
          user: 'yongqiwu',
          in_channel: 'general',
          count: 3
        });
        console.log('✅ Multi-filter query executed successfully');
        console.log(`   Result length: ${result3.length} characters`);
        if (result3.length > 0) {
          const lines = result3.split('\n');
          console.log(`   Found ${lines.length > 1 ? lines.length - 1 : 0} messages (excluding header)`);
        }

        // Test 4: Query with date filter
        console.log('\n🔍 Test 4: Query with date filter');
        const result4 = await searchTool.invoke({ 
          query: 'update',
          after_date: '2025-01-01',
          count: 5
        });
        console.log('✅ Date filter query executed successfully');
        console.log(`   Result length: ${result4.length} characters`);
        if (result4.length > 0) {
          const lines = result4.split('\n');
          console.log(`   Found ${lines.length > 1 ? lines.length - 1 : 0} messages (excluding header)`);
        }

        // Test 5: Test sorting options
        console.log('\n🔍 Test 5: Test with timestamp sorting');
        const result5 = await searchTool.invoke({ 
          query: 'claude',
          sort: 'timestamp',
          sort_dir: 'desc',
          count: 3
        });
        console.log('✅ Timestamp sorting executed successfully');
        console.log(`   Result length: ${result5.length} characters`);
        
        console.log('\n📊 All search message tests completed successfully!');
        
      } else {
        console.error('❌ Could not find slack__search_messages tool');
      }
    } catch (error) {
      console.error(`❌ slack__search_messages failed: ${error}`);
    }

    console.log('\n🎉 slack__search_messages testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testSlackSearchMessages().catch(console.error);