/**
 * Quick test script for GitHub repository search API
 * Tests GitHub OAuth with read-only public repository access permissions
 */

import { getTokens } from './get-tokens.js';

async function testGitHubRepositorySearch() {
  try {
    console.log('🧪 Testing GitHub Repository Search API...');
    
    const tokens = getTokens();
    
    if (!tokens.github_token) {
      console.error('❌ No GitHub token found in COOKIES environment variable');
      console.log('💡 Make sure to set COOKIES with github_token=your_token_here');
      process.exit(1);
    }

    console.log('✅ Found GitHub token, making API requests...');

    // Test 1: Search repositories
    console.log('\n🔍 Testing repository search...');
    const searchResponse = await fetch('https://api.github.com/search/repositories?q=language:typescript+stars:>1000&sort=stars&order=desc&per_page=5', {
      headers: {
        'Authorization': `Bearer ${tokens.github_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!searchResponse.ok) {
      console.error('❌ Repository search failed:', searchResponse.status, searchResponse.statusText);
      const errorText = await searchResponse.text();
      console.error('Error details:', errorText);
    } else {
      const searchData = await searchResponse.json();
      console.log('✅ Repository Search Results:');
      console.log(`📊 Total repositories found: ${searchData.total_count}`);
      console.log('🔗 Top repositories:');
      searchData.items.slice(0, 3).forEach((repo: any, index: number) => {
        console.log(`   ${index + 1}. ${repo.full_name} (⭐ ${repo.stargazers_count})`);
        console.log(`      📝 ${repo.description || 'No description'}`);
      });
    }

    // Test 2: Get user's repositories
    console.log('\n📁 Testing user repositories...');
    const userReposResponse = await fetch('https://api.github.com/user/repos?type=all&sort=updated&per_page=5', {
      headers: {
        'Authorization': `Bearer ${tokens.github_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userReposResponse.ok) {
      console.error('❌ User repositories request failed:', userReposResponse.status, userReposResponse.statusText);
    } else {
      const userRepos = await userReposResponse.json();
      console.log('✅ User Repositories:');
      userRepos.slice(0, 3).forEach((repo: any, index: number) => {
        console.log(`   ${index + 1}. ${repo.full_name} (${repo.private ? '🔒 Private' : '🌐 Public'})`);
        console.log(`      📅 Updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
      });
    }

    // Test 3: Search code (requires repo scope)
    console.log('\n🔍 Testing code search...');
    const codeSearchResponse = await fetch('https://api.github.com/search/code?q=console.log+language:javascript&per_page=3', {
      headers: {
        'Authorization': `Bearer ${tokens.github_token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!codeSearchResponse.ok) {
      console.error('❌ Code search failed:', codeSearchResponse.status, codeSearchResponse.statusText);
    } else {
      const codeData = await codeSearchResponse.json();
      console.log('✅ Code Search Results:');
      console.log(`📊 Total code files found: ${codeData.total_count}`);
      console.log('📄 Sample files:');
      codeData.items.slice(0, 2).forEach((item: any, index: number) => {
        console.log(`   ${index + 1}. ${item.name} in ${item.repository.full_name}`);
        console.log(`      🔗 ${item.html_url}`);
      });
    }

    console.log('\n✅ All GitHub API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testGitHubRepositorySearch();