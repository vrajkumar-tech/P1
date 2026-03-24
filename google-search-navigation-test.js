const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const DURATION_MINUTES = parseInt(process.env.DURATION_MINUTES || '10');
const CONCURRENT_SESSIONS = parseInt(process.env.CONCURRENT_SESSIONS || '3');
const SESSION_DEPTH = parseInt(process.env.SESSION_DEPTH || '4');

const searchQueries = [
  'rkoots games',
  'rkoots cron', 
  'rkoots tools',
  'rkoots blog'
];

let discoveredSite = null;
const stats = {
  searchQueries: 0,
  searchResults: 0,
  rkootsSiteFound: false,
  siteUrl: null,
  totalSessions: 0,
  completedSessions: 0,
  failedSessions: 0,
  totalPageViews: 0,
  totalSessionDuration: 0,
  bounces: 0,
  pageStats: {},
  navigationPaths: [],
  errors: [],
  startTime: null,
  endTime: null
};

async function performGoogleSearch(page, query) {
  console.log(chalk.blue(`🔍 Searching Google for: "${query}"`));
  
  try {
    // Use a more realistic search approach to avoid detection
    await page.goto('https://www.google.com', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for the search box to be visible and interact with it naturally
    await page.waitForSelector('textarea[name="q"]', { timeout: 10000 });
    
    // Type the query with human-like delays
    await page.focus('textarea[name="q"]');
    await page.type('textarea[name="q"]', query, { delay: 100 });
    
    // Wait a moment before submitting
    await page.waitForTimeout(500);
    
    // Press Enter instead of clicking to be more natural
    await page.press('textarea[name="q"]', 'Enter');
    
    // Wait for results to load
    await page.waitForTimeout(3000);
    
    // Try multiple selectors for search results
    let searchResults = [];
    
    try {
      searchResults = await page.$$eval('div.g', results => {
        return results.map(result => {
          const linkElement = result.querySelector('a');
          const titleElement = result.querySelector('h3');
          const snippetElement = result.querySelector('.VwiC3b');
          
          return {
            url: linkElement ? linkElement.href : null,
            title: titleElement ? titleElement.textContent.trim() : null,
            snippet: snippetElement ? snippetElement.textContent.trim() : null
          };
        }).filter(result => result.url);
      });
    } catch (e) {
      // Fallback to different selector
      try {
        searchResults = await page.$$eval('div[data-hveid]', results => {
          return results.map(result => {
            const linkElement = result.querySelector('a');
            const titleElement = result.querySelector('h3');
            
            return {
              url: linkElement ? linkElement.href : null,
              title: titleElement ? titleElement.textContent.trim() : null,
              snippet: ''
            };
          }).filter(result => result.url);
        });
      } catch (e2) {
        console.log(chalk.yellow('⚠️  Could not extract search results, trying alternative approach...'));
      }
    }

    // If still no results, try using DuckDuckGo as fallback
    if (searchResults.length === 0) {
      console.log(chalk.yellow('🔄 Trying DuckDuckGo as fallback...'));
      searchResults = await performDuckDuckGoSearch(page, query);
    }

    stats.searchResults += searchResults.length;
    console.log(chalk.green(`✅ Found ${searchResults.length} search results`));
    
    return searchResults;
    
  } catch (error) {
    console.error(chalk.red(`❌ Google search failed for "${query}":`, error.message));
    return [];
  }
}

async function performDuckDuckGoSearch(page, query) {
  try {
    await page.goto('https://duckduckgo.com/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    await page.waitForSelector('#searchbox_input', { timeout: 10000 });
    await page.focus('#searchbox_input');
    await page.type('#searchbox_input', query, { delay: 100 });
    await page.waitForTimeout(500);
    await page.press('#searchbox_input', 'Enter');
    
    await page.waitForTimeout(3000);

    const searchResults = await page.$$eval('.result__body', results => {
      return results.map(result => {
        const linkElement = result.querySelector('.result__a');
        const snippetElement = result.querySelector('.result__snippet');
        
        return {
          url: linkElement ? linkElement.href : null,
          title: linkElement ? linkElement.textContent.trim() : null,
          snippet: snippetElement ? snippetElement.textContent.trim() : null
        };
      }).filter(result => result.url);
    });

    return searchResults;
    
  } catch (error) {
    console.error(chalk.red(`❌ DuckDuckGo search failed:`, error.message));
    return [];
  }
}

async function findRkootsSite(searchResults) {
  console.log(chalk.yellow('🔎 Looking for rkoots.github.io in search results...'));
  
  for (const result of searchResults) {
    if (result.url && result.url.includes('rkoots.github.io')) {
      console.log(chalk.green(`✅ Found rkoots.github.io: ${result.url}`));
      console.log(chalk.cyan(`   Title: ${result.title}`));
      console.log(chalk.cyan(`   Snippet: ${result.snippet}`));
      
      discoveredSite = result.url;
      stats.rkootsSiteFound = true;
      stats.siteUrl = result.url;
      
      return result.url;
    }
  }
  
  return null;
}

async function discoverSiteStructure(page, baseUrl) {
  console.log(chalk.blue('🔍 Discovering site structure...'));
  
  try {
    await page.goto(baseUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const links = await page.$$eval('a[href]', links => {
      return links
        .map(link => ({
          href: link.href,
          text: link.textContent.trim(),
          isInternal: link.href.startsWith(window.location.origin) || link.href.startsWith('/')
        }))
        .filter(link => link.isInternal && link.text.length > 0);
    });

    const uniqueLinks = [...new Map(links.map(link => [link.href, link])).values()];
    console.log(chalk.green(`✅ Discovered ${uniqueLinks.length} internal links`));
    
    return uniqueLinks.map((link, index) => ({
      path: link.href.startsWith('http') ? link.href.replace(baseUrl, '') || '/' : link.href,
      name: link.text || `Page ${index + 1}`,
      weight: Math.max(1, 10 - index) // Earlier links have higher weight
    }));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to discover site structure:', error.message));
    return [{ path: '/', name: 'Homepage', weight: 10 }];
  }
}

async function simulateUserSession(sessionId, browser, baseUrl, endpoints) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();
  const sessionData = {
    sessionId,
    startTime: Date.now(),
    pages: [],
    success: true,
    error: null
  };

  try {
    const pagesToVisit = Math.max(1, Math.floor(SESSION_DEPTH + (Math.random() - 0.5) * 2));
    let currentPath = null;
    const visitedPaths = [];

    for (let i = 0; i < pagesToVisit; i++) {
      const endpoint = i === 0 
        ? endpoints.find(e => e.path === '/')
        : getWeightedRandomEndpoint(endpoints, currentPath);
      
      const url = endpoint.path.startsWith('http') ? endpoint.path : `${baseUrl}${endpoint.path}`;
      const pageStartTime = Date.now();

      try {
        const response = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        const loadTime = Date.now() - pageStartTime;
        
        stats.totalPageViews++;
        
        if (!stats.pageStats[endpoint.path]) {
          stats.pageStats[endpoint.path] = {
            views: 0,
            avgLoadTime: 0,
            loadTimes: [],
            clicks: 0,
            errors: 0
          };
        }
        
        stats.pageStats[endpoint.path].views++;
        stats.pageStats[endpoint.path].loadTimes.push(loadTime);
        
        visitedPaths.push(endpoint.path);
        currentPath = endpoint.path;

        await page.waitForTimeout(Math.random() * 2000 + 1000);

        // Random scrolling
        await page.evaluate(() => {
          window.scrollTo({
            top: Math.random() * (document.body.scrollHeight - window.innerHeight),
            behavior: 'smooth'
          });
        });

        await page.waitForTimeout(Math.random() * 2000 + 1000);

        // Try to click a random internal link
        const internalLinks = await page.$$eval('a[href]', links => {
          return links
            .map(link => link.href)
            .filter(href => href.startsWith(window.location.origin) || href.startsWith('/'))
            .slice(0, 5);
        });

        if (internalLinks.length > 0 && Math.random() > 0.5) {
          const randomLink = internalLinks[Math.floor(Math.random() * internalLinks.length)];
          try {
            await page.evaluate((href) => {
              const link = document.querySelector(`a[href="${href}"]`);
              if (link) link.click();
            }, randomLink);
            stats.pageStats[endpoint.path].clicks++;
            await page.waitForTimeout(500);
          } catch (clickError) {
            // Ignore click errors
          }
        }

        sessionData.pages.push({
          path: endpoint.path,
          name: endpoint.name,
          loadTime,
          statusCode: response?.status() || 0,
          timestamp: Date.now()
        });

      } catch (pageError) {
        stats.pageStats[endpoint.path].errors++;
        sessionData.pages.push({
          path: endpoint.path,
          name: endpoint.name,
          error: pageError.message,
          timestamp: Date.now()
        });
        
        if (i === 0) {
          stats.bounces++;
        }
        break;
      }
    }

    sessionData.endTime = Date.now();
    sessionData.duration = sessionData.endTime - sessionData.startTime;
    stats.totalSessionDuration += sessionData.duration;
    stats.completedSessions++;

    stats.navigationPaths.push({
      sessionId,
      path: visitedPaths,
      duration: sessionData.duration,
      pageViews: visitedPaths.length
    });

  } catch (error) {
    sessionData.success = false;
    sessionData.error = error.message;
    stats.failedSessions++;
    stats.errors.push({
      sessionId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    await context.close();
  }

  return sessionData;
}

function getWeightedRandomEndpoint(endpoints, excludePath = null) {
  const availableEndpoints = endpoints.filter(e => e.path !== excludePath);
  const totalWeight = availableEndpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of availableEndpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }
  
  return availableEndpoints[availableEndpoints.length - 1];
}

async function runGoogleSearchAndNavigationTest() {
  console.log(chalk.bold.green('\n🎯 Starting Google Search & Site Discovery Navigation Test\n'));
  console.log(chalk.yellow(`Duration: ${DURATION_MINUTES} minutes`));
  console.log(chalk.yellow(`Concurrent Sessions: ${CONCURRENT_SESSIONS}`));
  console.log(chalk.yellow(`Avg Pages/Session: ${SESSION_DEPTH}`));
  console.log(chalk.yellow(`Search Queries: ${searchQueries.length}\n`));

  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }
  if (!fs.existsSync('traces')) {
    fs.mkdirSync('traces');
  }

  stats.startTime = new Date().toISOString();
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });

  // Phase 1: Google Search and Site Discovery
  console.log(chalk.cyan('🔍 Phase 1: Google Search and Site Discovery\n'));
  
  const searchPage = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Add extra headers to look more like a real browser
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  }).then(context => context.newPage());
  
  let siteEndpoints = [];
  
  for (const query of searchQueries) {
    stats.searchQueries++;
    const searchResults = await performGoogleSearch(searchPage, query);
    const foundSite = await findRkootsSite(searchResults);
    
    if (foundSite) {
      siteEndpoints = await discoverSiteStructure(searchPage, foundSite);
      break;
    }
    
    await searchPage.waitForTimeout(1000);
  }
  
  await searchPage.close();

  if (!discoveredSite) {
    console.log(chalk.yellow('⚠️  No rkoots.github.io site found in search results'));
    console.log(chalk.cyan('🔄 Trying direct access to common rkoots.github.io URLs...'));
    
    // Fallback: Try common GitHub Pages URLs directly
    const fallbackUrls = [
      'https://rkoots.github.io',
      'https://rkoots.github.io/',
      'https://rkoots.github.io/tools',
      'https://rkoots.github.io/tools/',
      'https://rkoots.github.io/games',
      'https://rkoots.github.io/blog',
      'https://rkoots.github.io/projects'
    ];
    
    const testPage = await browser.newPage();
    
    for (const url of fallbackUrls) {
      try {
        console.log(chalk.blue(`🔍 Testing direct access to: ${url}`));
        
        const response = await testPage.goto(url, {
          waitUntil: 'networkidle',
          timeout: 15000
        });
        
        if (response && response.status() === 200) {
          console.log(chalk.green(`✅ Successfully accessed: ${url}`));
          discoveredSite = url;
          stats.siteUrl = url;
          stats.rkootsSiteFound = true;
          
          // Discover site structure
          siteEndpoints = await discoverSiteStructure(testPage, url);
          break;
        }
      } catch (error) {
        console.log(chalk.yellow(`❌ Failed to access ${url}: ${error.message}`));
      }
    }
    
    await testPage.close();
    
    if (!discoveredSite) {
      console.log(chalk.red('❌ No rkoots.github.io site found via search or direct access'));
      await browser.close();
      generateReport();
      return;
    }
  }

  // Phase 2: Navigation Testing
  console.log(chalk.cyan('\n🚀 Phase 2: Navigation Testing\n'));
  console.log(chalk.yellow(`Target Site: ${discoveredSite}`));
  console.log(chalk.yellow(`Discovered ${siteEndpoints.length} pages\n`));

  const endTime = Date.now() + (DURATION_MINUTES * 60 * 1000);
  const activeSessions = new Set();
  let sessionCounter = 0;

  const sessionInterval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(sessionInterval);
      return;
    }

    while (activeSessions.size < CONCURRENT_SESSIONS && Date.now() < endTime) {
      const sessionId = ++sessionCounter;
      stats.totalSessions++;
      
      const sessionPromise = simulateUserSession(sessionId, browser, discoveredSite, siteEndpoints)
        .finally(() => {
          activeSessions.delete(sessionPromise);
          
          if (sessionCounter % 5 === 0) {
            const avgDuration = stats.completedSessions > 0 
              ? Math.round(stats.totalSessionDuration / stats.completedSessions / 1000)
              : 0;
            const avgPages = stats.completedSessions > 0
              ? (stats.totalPageViews / stats.completedSessions).toFixed(1)
              : 0;
            
            console.log(chalk.blue(
              `Sessions: ${stats.totalSessions} | ` +
              `Completed: ${stats.completedSessions} | ` +
              `Page Views: ${stats.totalPageViews} | ` +
              `Avg Duration: ${avgDuration}s | ` +
              `Avg Pages: ${avgPages}`
            ));
          }
        });

      activeSessions.add(sessionPromise);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }
  }, 1000);

  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      if (Date.now() >= endTime && activeSessions.size === 0) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });

  console.log(chalk.blue('\n⏳ Waiting for remaining sessions to complete...\n'));
  await Promise.all([...activeSessions]);

  await browser.close();
  stats.endTime = new Date().toISOString();

  generateReport();
}

function generateReport() {
  // Calculate averages
  Object.keys(stats.pageStats).forEach(path => {
    const pageStat = stats.pageStats[path];
    if (pageStat.loadTimes.length > 0) {
      pageStat.avgLoadTime = Math.round(
        pageStat.loadTimes.reduce((a, b) => a + b, 0) / pageStat.loadTimes.length
      );
    }
  });

  const avgSessionDuration = stats.completedSessions > 0
    ? Math.round(stats.totalSessionDuration / stats.completedSessions / 1000)
    : 0;

  const avgPagesPerSession = stats.completedSessions > 0
    ? (stats.totalPageViews / stats.completedSessions).toFixed(2)
    : 0;

  const bounceRate = stats.totalSessions > 0
    ? ((stats.bounces / stats.totalSessions) * 100).toFixed(2)
    : 0;

  const navigationSuccessRate = stats.totalSessions > 0
    ? ((stats.completedSessions / stats.totalSessions) * 100).toFixed(2)
    : 0;

  console.log(chalk.bold.green('\n\n📊 Google Search & Navigation Test Results\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.white(`Site Discovered: ${stats.siteUrl || 'None'}`));
  console.log(chalk.white(`Search Queries: ${stats.searchQueries}`));
  console.log(chalk.white(`Search Results: ${stats.searchResults}`));
  console.log(chalk.white(`Duration: ${DURATION_MINUTES} minutes`));
  console.log(chalk.white(`Start Time: ${stats.startTime}`));
  console.log(chalk.white(`End Time: ${stats.endTime}`));
  console.log(chalk.cyan('═'.repeat(70)));

  console.log(chalk.bold.yellow('\n📈 Session Statistics:'));
  console.log(chalk.white(`  Total Sessions: ${stats.totalSessions}`));
  console.log(chalk.green(`  Completed Sessions: ${stats.completedSessions} (${navigationSuccessRate}%)`));
  console.log(chalk.red(`  Failed Sessions: ${stats.failedSessions}`));
  console.log(chalk.white(`  Total Page Views: ${stats.totalPageViews}`));
  console.log(chalk.white(`  Avg Pages/Session: ${avgPagesPerSession}`));
  console.log(chalk.white(`  Avg Session Duration: ${avgSessionDuration}s`));
  console.log(chalk.white(`  Bounce Rate: ${bounceRate}%`));

  if (Object.keys(stats.pageStats).length > 0) {
    console.log(chalk.bold.yellow('\n📄 Page Performance:'));
    Object.entries(stats.pageStats)
      .sort(([, a], [, b]) => b.views - a.views)
      .forEach(([path, pageStat]) => {
        console.log(chalk.cyan(`\n  ${path}`));
        console.log(chalk.white(`    Views: ${pageStat.views}`));
        console.log(chalk.white(`    Avg Load Time: ${pageStat.avgLoadTime}ms`));
        console.log(chalk.white(`    Clicks: ${pageStat.clicks}`));
        if (pageStat.errors > 0) {
          console.log(chalk.red(`    Errors: ${pageStat.errors}`));
        }
      });
  }

  if (stats.errors.length > 0) {
    console.log(chalk.bold.red('\n❌ Errors:'));
    stats.errors.slice(0, 10).forEach(error => {
      console.log(chalk.red(`  Session ${error.sessionId}: ${error.error}`));
    });
  }

  // Save JSON report
  const jsonReport = {
    siteDiscovered: stats.siteUrl,
    searchQueries: stats.searchQueries,
    searchResults: stats.searchResults,
    duration: DURATION_MINUTES,
    startTime: stats.startTime,
    endTime: stats.endTime,
    totalSessions: stats.totalSessions,
    completedSessions: stats.completedSessions,
    failedSessions: stats.failedSessions,
    navigationSuccessRate: parseFloat(navigationSuccessRate),
    totalPageViews: stats.totalPageViews,
    avgPagesPerSession: parseFloat(avgPagesPerSession),
    avgSessionDuration,
    bounceRate: parseFloat(bounceRate),
    pageStats: stats.pageStats,
    topNavigationPaths: stats.navigationPaths
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 20),
    errors: stats.errors.slice(0, 50)
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonFilename = `search-navigation-results-${timestamp}.json`;
  fs.writeFileSync(jsonFilename, JSON.stringify(jsonReport, null, 2));
  console.log(chalk.green(`\n✅ Results saved to ${jsonFilename}`));

  generateHtmlReport(jsonReport, timestamp);
}

function generateHtmlReport(data, timestamp) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Search & Navigation Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); padding: 40px; }
    h1 { color: #2c3e50; margin-bottom: 10px; font-size: 36px; }
    .meta { color: #7f8c8d; margin-bottom: 30px; font-size: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: transform 0.3s; }
    .stat-card:hover { transform: translateY(-5px); }
    .stat-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    .stat-card.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .stat-card.info { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    .stat-label { font-size: 14px; opacity: 0.9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .stat-value { font-size: 36px; font-weight: bold; }
    .section { margin-bottom: 40px; }
    .section-title { color: #2c3e50; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #3498db; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    th, td { padding: 15px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
    tr:hover { background: #f8f9fa; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    .site-info { background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #28a745; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Google Search & Navigation Test Report</h1>
    <div class="meta">
      <strong>Duration:</strong> ${data.duration} minutes<br>
      <strong>Start:</strong> ${data.startTime}<br>
      <strong>End:</strong> ${data.endTime}
    </div>

    ${data.siteDiscovered ? `
    <div class="site-info">
      <h3 style="color: #28a745; margin-bottom: 10px;">✅ Site Discovered</h3>
      <strong>URL:</strong> <a href="${data.siteDiscovered}" target="_blank">${data.siteDiscovered}</a><br>
      <strong>Search Queries:</strong> ${data.searchQueries}<br>
      <strong>Search Results Analyzed:</strong> ${data.searchResults}
    </div>
    ` : `
    <div class="site-info" style="border-left-color: #dc3545;">
      <h3 style="color: #dc3545; margin-bottom: 10px;">❌ No Site Discovered</h3>
      <strong>Search Queries:</strong> ${data.searchQueries}<br>
      <strong>Search Results Analyzed:</strong> ${data.searchResults}
    </div>
    `}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Sessions</div>
        <div class="stat-value">${data.totalSessions}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Success Rate</div>
        <div class="stat-value">${data.navigationSuccessRate}%</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Page Views</div>
        <div class="stat-value">${data.totalPageViews}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Bounce Rate</div>
        <div class="stat-value">${data.bounceRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Pages/Session</div>
        <div class="stat-value">${data.avgPagesPerSession}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Avg Session Duration</div>
        <div class="stat-value">${data.avgSessionDuration}s</div>
      </div>
    </div>

    ${Object.keys(data.pageStats).length > 0 ? `
    <div class="section">
      <h2 class="section-title">📄 Page Performance</h2>
      <table>
        <tr>
          <th>Page</th>
          <th>Views</th>
          <th>Avg Load Time</th>
          <th>Clicks</th>
          <th>Errors</th>
        </tr>
        ${Object.entries(data.pageStats)
          .sort(([, a], [, b]) => b.views - a.views)
          .map(([path, stats]) => `
            <tr>
              <td><strong>${path}</strong></td>
              <td>${stats.views}</td>
              <td>${stats.avgLoadTime}ms</td>
              <td>${stats.clicks}</td>
              <td>${stats.errors > 0 ? `<span class="badge badge-danger">${stats.errors}</span>` : '0'}</td>
            </tr>
          `).join('')}
      </table>
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">🚶 Top Navigation Paths</h2>
      <table>
        <tr>
          <th>Session ID</th>
          <th>Pages Visited</th>
          <th>Duration</th>
          <th>Path</th>
        </tr>
        ${data.topNavigationPaths.slice(0, 15).map(path => `
          <tr>
            <td>${path.sessionId}</td>
            <td>${path.pageViews}</td>
            <td>${Math.round(path.duration / 1000)}s</td>
            <td><small>${path.path.join(' → ')}</small></td>
          </tr>
        `).join('')}
      </table>
    </div>
  </div>
</body>
</html>
  `;

  const htmlFilename = `navigation-report-${timestamp}.html`;
  fs.writeFileSync(htmlFilename, html);
  console.log(chalk.green(`✅ HTML report saved to ${htmlFilename}\n`));
}

runGoogleSearchAndNavigationTest().catch(error => {
  console.error(chalk.red('\n❌ Test failed:'), error);
  process.exit(1);
});
