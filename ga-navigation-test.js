const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const TARGET_HOST = process.env.TARGET_HOST;
const DURATION_MINUTES = parseInt(process.env.DURATION_MINUTES || '10');
const CONCURRENT_SESSIONS = parseInt(process.env.CONCURRENT_SESSIONS || '50');
const SESSION_DEPTH = parseInt(process.env.SESSION_DEPTH || '5');

const endpoints = [
  { path: '/', name: 'Homepage', weight: 10 },
  { path: '/about_us.html', name: 'About Us', weight: 8 },
  { path: '/about_us_2.html', name: 'About Us Alt', weight: 3 },
  { path: '/california_disclosures.html', name: 'CA Disclosures', weight: 2 },
  { path: '/faqs.html', name: 'FAQs', weight: 7 },
  { path: '/how_it_works.html', name: 'How It Works', weight: 9 },
  { path: '/oppu.html', name: 'OPPU', weight: 6 },
  { path: '/personal_loans.html', name: 'Personal Loans', weight: 10 },
  { path: '/privacy_policy.html', name: 'Privacy Policy', weight: 2 },
  { path: '/rates_terms.html', name: 'Rates & Terms', weight: 8 },
  { path: '/resources.html', name: 'Resources', weight: 5 },
  { path: '/terms_of_use.html', name: 'Terms of Use', weight: 2 }
];

const funnels = {
  'Homepage to Personal Loans': ['/', '/personal_loans.html'],
  'Homepage to How It Works to Personal Loans': ['/', '/how_it_works.html', '/personal_loans.html'],
  'Homepage to About to Personal Loans': ['/', '/about_us.html', '/personal_loans.html'],
  'Homepage to FAQs to Personal Loans': ['/', '/faqs.html', '/personal_loans.html'],
  'Resources Journey': ['/', '/resources.html', '/how_it_works.html'],
  'Information Gathering': ['/', '/about_us.html', '/faqs.html', '/rates_terms.html']
};

const stats = {
  totalSessions: 0,
  completedSessions: 0,
  failedSessions: 0,
  totalPageViews: 0,
  totalSessionDuration: 0,
  bounces: 0,
  gaEventsTracked: 0,
  gaEventsFailed: 0,
  pageStats: {},
  navigationPaths: [],
  funnelTracking: {},
  errors: [],
  startTime: null,
  endTime: null
};

endpoints.forEach(endpoint => {
  stats.pageStats[endpoint.path] = {
    views: 0,
    avgLoadTime: 0,
    loadTimes: [],
    clicks: 0,
    gaTracked: 0,
    gaFailed: 0,
    errors: 0
  };
});

Object.keys(funnels).forEach(funnelName => {
  stats.funnelTracking[funnelName] = {
    started: 0,
    completed: 0,
    abandoned: [],
    avgCompletionTime: 0,
    completionTimes: []
  };
});

function getWeightedRandomEndpoint(excludePath = null) {
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

function detectFunnelMatch(path) {
  const matches = [];
  for (const [funnelName, funnelPath] of Object.entries(funnels)) {
    if (path.length >= funnelPath.length) {
      let isMatch = true;
      for (let i = 0; i < funnelPath.length; i++) {
        if (path[i] !== funnelPath[i]) {
          isMatch = false;
          break;
        }
      }
      if (isMatch) {
        matches.push(funnelName);
      }
    }
  }
  return matches;
}

async function simulateUserSession(sessionId, browser) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { longitude: -74.006, latitude: 40.7128 },
    permissions: ['geolocation']
  });

  await context.addInitScript(() => {
    window.gaEvents = [];
    window.dataLayer = window.dataLayer || [];
    const originalPush = window.dataLayer.push;
    window.dataLayer.push = function(...args) {
      window.gaEvents.push({ timestamp: Date.now(), data: args });
      return originalPush.apply(this, args);
    };
    
    if (window.gtag) {
      const originalGtag = window.gtag;
      window.gtag = function(...args) {
        window.gaEvents.push({ timestamp: Date.now(), type: 'gtag', data: args });
        return originalGtag.apply(this, args);
      };
    }
    
    if (window.ga) {
      const originalGa = window.ga;
      window.ga = function(...args) {
        window.gaEvents.push({ timestamp: Date.now(), type: 'ga', data: args });
        return originalGa.apply(this, args);
      };
    }
  });

  const page = await context.newPage();
  const sessionData = {
    sessionId,
    startTime: Date.now(),
    pages: [],
    gaEvents: [],
    success: true,
    error: null
  };

  try {
    const pagesToVisit = Math.max(1, Math.floor(SESSION_DEPTH + (Math.random() - 0.5) * 4));
    let currentPath = null;
    const visitedPaths = [];

    for (let i = 0; i < pagesToVisit; i++) {
      const endpoint = i === 0 
        ? endpoints.find(e => e.path === '/')
        : getWeightedRandomEndpoint(currentPath);
      
      const url = `${TARGET_HOST}${endpoint.path}`;
      const pageStartTime = Date.now();

      try {
        const response = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000
        });

        const loadTime = Date.now() - pageStartTime;
        
        stats.totalPageViews++;
        stats.pageStats[endpoint.path].views++;
        stats.pageStats[endpoint.path].loadTimes.push(loadTime);
        
        visitedPaths.push(endpoint.path);
        currentPath = endpoint.path;

        await page.waitForTimeout(Math.random() * 2000 + 1000);

        const gaEvents = await page.evaluate(() => window.gaEvents || []);
        sessionData.gaEvents.push(...gaEvents);
        stats.gaEventsTracked += gaEvents.length;
        stats.pageStats[endpoint.path].gaTracked += gaEvents.length;

        sessionData.pages.push({
          path: endpoint.path,
          name: endpoint.name,
          loadTime,
          statusCode: response?.status() || 0,
          gaEvents: gaEvents.length,
          timestamp: Date.now()
        });

        const links = await page.$$('a[href]');
        if (links.length > 0 && Math.random() > 0.3) {
          const randomLink = links[Math.floor(Math.random() * Math.min(links.length, 10))];
          try {
            const href = await randomLink.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
              await randomLink.click({ timeout: 2000 });
              stats.pageStats[endpoint.path].clicks++;
              await page.waitForTimeout(500);
            }
          } catch (clickError) {
          }
        }

        await page.evaluate(() => {
          window.scrollTo({
            top: Math.random() * (document.body.scrollHeight - window.innerHeight),
            behavior: 'smooth'
          });
        });

        await page.waitForTimeout(Math.random() * 3000 + 2000);

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

    const funnelMatches = detectFunnelMatch(visitedPaths);
    funnelMatches.forEach(funnelName => {
      stats.funnelTracking[funnelName].completed++;
      const completionTime = Date.now() - sessionData.startTime;
      stats.funnelTracking[funnelName].completionTimes.push(completionTime);
    });

    Object.entries(funnels).forEach(([funnelName, funnelPath]) => {
      if (visitedPaths[0] === funnelPath[0]) {
        stats.funnelTracking[funnelName].started++;
        if (!funnelMatches.includes(funnelName)) {
          const abandonedAt = visitedPaths.length;
          stats.funnelTracking[funnelName].abandoned.push(abandonedAt);
        }
      }
    });

    sessionData.endTime = Date.now();
    sessionData.duration = sessionData.endTime - sessionData.startTime;
    stats.totalSessionDuration += sessionData.duration;
    stats.completedSessions++;

    stats.navigationPaths.push({
      sessionId,
      path: visitedPaths,
      duration: sessionData.duration,
      pageViews: visitedPaths.length,
      gaEvents: sessionData.gaEvents.length
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

async function runNavigationTest() {
  console.log(chalk.bold.green('\n🎯 Starting Google Analytics Navigation Test\n'));
  console.log(chalk.yellow(`Target: ${TARGET_HOST}`));
  console.log(chalk.yellow(`Duration: ${DURATION_MINUTES} minutes`));
  console.log(chalk.yellow(`Concurrent Sessions: ${CONCURRENT_SESSIONS}`));
  console.log(chalk.yellow(`Avg Pages/Session: ${SESSION_DEPTH}`));
  console.log(chalk.yellow(`Total Endpoints: ${endpoints.length}\n`));

  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }
  if (!fs.existsSync('traces')) {
    fs.mkdirSync('traces');
  }

  stats.startTime = new Date().toISOString();
  const endTime = Date.now() + (DURATION_MINUTES * 60 * 1000);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const activeSessions = new Set();
  let sessionCounter = 0;

  console.log(chalk.cyan('🚀 Starting user sessions...\n'));

  const sessionInterval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(sessionInterval);
      return;
    }

    while (activeSessions.size < CONCURRENT_SESSIONS && Date.now() < endTime) {
      const sessionId = ++sessionCounter;
      stats.totalSessions++;
      
      const sessionPromise = simulateUserSession(sessionId, browser)
        .finally(() => {
          activeSessions.delete(sessionPromise);
          
          if (sessionCounter % 10 === 0) {
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
              `Avg Pages: ${avgPages} | ` +
              `GA Events: ${stats.gaEventsTracked}`
            ));
          }
        });

      activeSessions.add(sessionPromise);
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));
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

  generateNavigationReport();
}

function generateNavigationReport() {
  Object.keys(stats.pageStats).forEach(path => {
    const pageStat = stats.pageStats[path];
    if (pageStat.loadTimes.length > 0) {
      pageStat.avgLoadTime = Math.round(
        pageStat.loadTimes.reduce((a, b) => a + b, 0) / pageStat.loadTimes.length
      );
    }
  });

  Object.keys(stats.funnelTracking).forEach(funnelName => {
    const funnel = stats.funnelTracking[funnelName];
    if (funnel.completionTimes.length > 0) {
      funnel.avgCompletionTime = Math.round(
        funnel.completionTimes.reduce((a, b) => a + b, 0) / funnel.completionTimes.length / 1000
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

  console.log(chalk.bold.green('\n\n📊 Navigation Test Results\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.white(`Host: ${TARGET_HOST}`));
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

  console.log(chalk.bold.yellow('\n🎯 Google Analytics Tracking:'));
  console.log(chalk.green(`  GA Events Tracked: ${stats.gaEventsTracked}`));
  console.log(chalk.red(`  GA Events Failed: ${stats.gaEventsFailed}`));
  console.log(chalk.white(`  Avg GA Events/Page: ${(stats.gaEventsTracked / stats.totalPageViews).toFixed(2)}`));

  console.log(chalk.bold.yellow('\n📄 Page Performance:'));
  Object.entries(stats.pageStats)
    .sort(([, a], [, b]) => b.views - a.views)
    .forEach(([path, pageStat]) => {
      const endpoint = endpoints.find(e => e.path === path);
      console.log(chalk.cyan(`\n  ${endpoint?.name || path}`));
      console.log(chalk.white(`    Views: ${pageStat.views}`));
      console.log(chalk.white(`    Avg Load Time: ${pageStat.avgLoadTime}ms`));
      console.log(chalk.white(`    Clicks: ${pageStat.clicks}`));
      console.log(chalk.white(`    GA Events: ${pageStat.gaTracked}`));
      if (pageStat.errors > 0) {
        console.log(chalk.red(`    Errors: ${pageStat.errors}`));
      }
    });

  console.log(chalk.bold.yellow('\n🔄 Funnel Analysis:'));
  Object.entries(stats.funnelTracking)
    .sort(([, a], [, b]) => b.started - a.started)
    .forEach(([funnelName, funnel]) => {
      const completionRate = funnel.started > 0
        ? ((funnel.completed / funnel.started) * 100).toFixed(2)
        : 0;
      
      console.log(chalk.cyan(`\n  ${funnelName}`));
      console.log(chalk.white(`    Started: ${funnel.started}`));
      console.log(chalk.green(`    Completed: ${funnel.completed} (${completionRate}%)`));
      console.log(chalk.red(`    Abandoned: ${funnel.abandoned.length}`));
      if (funnel.avgCompletionTime > 0) {
        console.log(chalk.white(`    Avg Completion Time: ${funnel.avgCompletionTime}s`));
      }
    });

  const jsonReport = {
    host: TARGET_HOST,
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
    gaEventsTracked: stats.gaEventsTracked,
    gaEventsFailed: stats.gaEventsFailed,
    pageStats: Object.fromEntries(
      Object.entries(stats.pageStats).map(([path, stat]) => [
        path,
        {
          name: endpoints.find(e => e.path === path)?.name || path,
          views: stat.views,
          avgLoadTime: stat.avgLoadTime,
          clicks: stat.clicks,
          gaTracked: stat.gaTracked,
          errors: stat.errors
        }
      ])
    ),
    funnelTracking: Object.fromEntries(
      Object.entries(stats.funnelTracking).map(([name, funnel]) => [
        name,
        {
          started: funnel.started,
          completed: funnel.completed,
          completionRate: funnel.started > 0 
            ? parseFloat(((funnel.completed / funnel.started) * 100).toFixed(2))
            : 0,
          avgCompletionTime: funnel.avgCompletionTime,
          abandonedCount: funnel.abandoned.length
        }
      ])
    ),
    topNavigationPaths: stats.navigationPaths
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 20),
    errors: stats.errors.slice(0, 50)
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const hostname = TARGET_HOST.replace(/https?:\/\//, '').replace(/\//g, '-');
  const jsonFilename = `navigation-results-${hostname}-${timestamp}.json`;

  fs.writeFileSync(jsonFilename, JSON.stringify(jsonReport, null, 2));
  console.log(chalk.green(`\n✅ Results saved to ${jsonFilename}`));

  const funnelFilename = `funnel-analysis-${hostname}-${timestamp}.json`;
  fs.writeFileSync(funnelFilename, JSON.stringify({
    host: TARGET_HOST,
    timestamp: stats.endTime,
    funnels: jsonReport.funnelTracking
  }, null, 2));
  console.log(chalk.green(`✅ Funnel analysis saved to ${funnelFilename}`));

  generateNavigationHtmlReport(jsonReport, hostname, timestamp);
}

function generateNavigationHtmlReport(data, hostname, timestamp) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GA Navigation Test Report - ${data.host}</title>
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
    .funnel-card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #3498db; }
    .funnel-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
    .funnel-bar { background: #ecf0f1; height: 30px; border-radius: 15px; overflow: hidden; margin: 10px 0; }
    .funnel-fill { background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%); height: 100%; display: flex; align-items: center; padding: 0 15px; color: white; font-weight: bold; transition: width 0.5s; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Google Analytics Navigation Test Report</h1>
    <div class="meta">
      <strong>Host:</strong> ${data.host}<br>
      <strong>Duration:</strong> ${data.duration} minutes<br>
      <strong>Start:</strong> ${data.startTime}<br>
      <strong>End:</strong> ${data.endTime}
    </div>

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
        <div class="stat-label">GA Events</div>
        <div class="stat-value">${data.gaEventsTracked}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🔄 Funnel Analysis</h2>
      ${Object.entries(data.funnelTracking)
        .sort(([, a], [, b]) => b.started - a.started)
        .map(([name, funnel]) => `
          <div class="funnel-card">
            <div class="funnel-title">${name}</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0;">
              <div>
                <div style="font-size: 12px; color: #7f8c8d;">Started</div>
                <div style="font-size: 24px; font-weight: bold; color: #2c3e50;">${funnel.started}</div>
              </div>
              <div>
                <div style="font-size: 12px; color: #7f8c8d;">Completed</div>
                <div style="font-size: 24px; font-weight: bold; color: #27ae60;">${funnel.completed}</div>
              </div>
              <div>
                <div style="font-size: 12px; color: #7f8c8d;">Abandoned</div>
                <div style="font-size: 24px; font-weight: bold; color: #e74c3c;">${funnel.abandonedCount}</div>
              </div>
            </div>
            <div class="funnel-bar">
              <div class="funnel-fill" style="width: ${funnel.completionRate}%">
                ${funnel.completionRate}% Completion
              </div>
            </div>
            ${funnel.avgCompletionTime > 0 ? `<div style="font-size: 14px; color: #7f8c8d; margin-top: 10px;">Avg Completion Time: ${funnel.avgCompletionTime}s</div>` : ''}
          </div>
        `).join('')}
    </div>

    <div class="section">
      <h2 class="section-title">📄 Page Performance</h2>
      <table>
        <tr>
          <th>Page</th>
          <th>Views</th>
          <th>Avg Load Time</th>
          <th>Clicks</th>
          <th>GA Events</th>
          <th>Errors</th>
        </tr>
        ${Object.entries(data.pageStats)
          .sort(([, a], [, b]) => b.views - a.views)
          .map(([path, stats]) => `
            <tr>
              <td><strong>${stats.name}</strong><br><small style="color: #7f8c8d;">${path}</small></td>
              <td>${stats.views}</td>
              <td>${stats.avgLoadTime}ms</td>
              <td>${stats.clicks}</td>
              <td><span class="badge badge-success">${stats.gaTracked}</span></td>
              <td>${stats.errors > 0 ? `<span class="badge badge-danger">${stats.errors}</span>` : '0'}</td>
            </tr>
          `).join('')}
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">🚶 Top Navigation Paths</h2>
      <table>
        <tr>
          <th>Session ID</th>
          <th>Pages Visited</th>
          <th>Duration</th>
          <th>GA Events</th>
          <th>Path</th>
        </tr>
        ${data.topNavigationPaths.slice(0, 15).map(path => `
          <tr>
            <td>${path.sessionId}</td>
            <td>${path.pageViews}</td>
            <td>${Math.round(path.duration / 1000)}s</td>
            <td>${path.gaEvents}</td>
            <td><small>${path.path.join(' → ')}</small></td>
          </tr>
        `).join('')}
      </table>
    </div>
  </div>
</body>
</html>
  `;

  const htmlFilename = `navigation-report-${hostname}-${timestamp}.html`;
  fs.writeFileSync(htmlFilename, html);
  console.log(chalk.green(`✅ HTML report saved to ${htmlFilename}\n`));
}

runNavigationTest().catch(error => {
  console.error(chalk.red('\n❌ Navigation test failed:'), error);
  process.exit(1);
});
