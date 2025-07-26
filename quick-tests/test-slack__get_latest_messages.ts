/**
 * Test script for slack__get_latest_messages tool
 * Tests the tool with unread functionality moved from client to tool
 */

import { SlackAPIClient } from '../src/mcp-servers/slack/slack-client.js';
import { SlackTools } from '../src/mcp-servers/slack/slack-tools.js';
import { requireSlackToken } from './get-tokens.js';

async function testSlackGetLatestMessages() {
  console.log('🧪 Testing slack__get_latest_messages...\n');

  try {
    // Get Slack token from environment
    const slackToken = requireSlackToken();
    console.log('✅ Slack token found\n');

    // Initialize Slack client and tools
    const slackClient = new SlackAPIClient(slackToken);
    const slackTools = new SlackTools(slackClient);

    // Test slack__get_latest_messages tool
    console.log('📍 Testing slack__get_latest_messages tool');
    try {
      const tools = slackTools.getTools();
      const getLatestTool = tools.find(tool => tool.name === 'slack__get_latest_messages');
      
      if (getLatestTool) {
        console.log('✅ Found slack__get_latest_messages tool');
        
        // Test with 1 day
        console.log('\n🔍 Testing with days: 1');
        let result = await getLatestTool.invoke({ days: 1 });
        
        // If no results with 1 day, try 30 days
        if (result.includes('No messages found')) {
          console.log('\n🔍 No messages in 1 day, trying 30 days...');
          result = await getLatestTool.invoke({ days: 30 });
        }
        console.log('✅ Tool execution succeeded');
        console.log(`   Result length: ${result.length} characters`);
        
        // Check if result contains unread status
        const hasUnreadInfo = result.includes('isUnread');
        console.log(`   Contains unread info: ${hasUnreadInfo ? '✅ Yes' : '❌ No'}`);
        
        // Check if result is grouped by channel
        const hasChannelHeaders = result.includes('Channel start --');
        console.log(`   Has channel headers: ${hasChannelHeaders ? '✅ Yes' : '❌ No'}`);
        
        // Show sample of the result
        if (result.length > 0) {
          const lines = result.split('\n');
          const sampleLines = lines.slice(0, 10);
          console.log(`   Sample output (first 10 lines):`);
          sampleLines.forEach((line, i) => {
            console.log(`     ${i + 1}: ${line}`);
          });
          
          if (lines.length > 10) {
            console.log(`     ... (${lines.length - 10} more lines)`);
          }
        } else {
          console.log('   No messages found in the last day');
        }
      } else {
        console.error('❌ Could not find slack__get_latest_messages tool');
      }
    } catch (error) {
      console.error(`❌ slack__get_latest_messages failed: ${error}`);
    }

    console.log('\n🎉 slack__get_latest_messages testing completed!');

  } catch (error) {
    console.error(`💥 Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testSlackGetLatestMessages().catch(console.error);