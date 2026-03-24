const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function findNavigationJsonFiles(dir) {
  const files = [];
  
  function traverse(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (item.startsWith('navigation-results-') && item.endsWith('.json')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentPath}:`, error.message);
    }
  }
  
  traverse(dir);
  return files;
}

function aggregateNavigationResults() {
  console.log(chalk.bold.cyan('\n🎯 Aggregating Navigation Test Results\n'));
  
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  
  let jsonFiles = [];
  if (fs.existsSync(artifactsDir)) {
    jsonFiles = findNavigationJsonFiles(artifactsDir);
  }
  
  jsonFiles = jsonFiles.concat(findNavigationJsonFiles(process.cwd()));
  
  if (jsonFiles.length === 0) {
    console.log(chalk.red('❌ No navigation result JSON files found.'));
    process.exit(1);
  }
  
  console.log(chalk.green(`✅ Found ${jsonFiles.length} navigation result file(s)\n`));
  
  const aggregated = {
    testRun: new Date().toISOString(),
    totalHosts: 0,
    hostStats: {},
    overallStats: {
      totalSessions: 0,
      completedSessions: 0,
      failedSessions: 0,
      totalPageViews: 0,
      totalSessionDuration: 0,
      totalBounces: 0,
      totalGAEvents: 0
    },
    pageComparison: {},
    funnelAnalysis: {},
    topPaths: []
  };
  
  jsonFiles.forEach(file => {
    try {
      console.log(chalk.blue(`📄 Processing: ${path.basename(file)}`));
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      
      const hostKey = data.host;
      aggregated.totalHosts++;
      
      aggregated.hostStats[hostKey] = {
        host: data.host,
        duration: data.duration,
        startTime: data.startTime,
        endTime: data.endTime,
        totalSessions: data.totalSessions,
        completedSessions: data.completedSessions,
        failedSessions: data.failedSessions,
        navigationSuccessRate: data.navigationSuccessRate,
        totalPageViews: data.totalPageViews,
        avgPagesPerSession: data.avgPagesPerSession,
        avgSessionDuration: data.avgSessionDuration,
        bounceRate: data.bounceRate,
        gaEventsTracked: data.gaEventsTracked,
        pageStats: data.pageStats,
        funnelTracking: data.funnelTracking,
        topNavigationPaths: data.topNavigationPaths || []
      };
      
      aggregated.overallStats.totalSessions += data.totalSessions;
      aggregated.overallStats.completedSessions += data.completedSessions;
      aggregated.overallStats.failedSessions += data.failedSessions;
      aggregated.overallStats.totalPageViews += data.totalPageViews;
      aggregated.overallStats.totalSessionDuration += (data.avgSessionDuration * data.completedSessions);
      aggregated.overallStats.totalBounces += Math.round((data.bounceRate / 100) * data.totalSessions);
      aggregated.overallStats.totalGAEvents += data.gaEventsTracked;
      
      Object.entries(data.pageStats).forEach(([page, stats]) => {
        if (!aggregated.pageComparison[page]) {
          aggregated.pageComparison[page] = {
            name: stats.name,
            hosts: {}
          };
        }
        aggregated.pageComparison[page].hosts[hostKey] = {
          views: stats.views,
          avgLoadTime: stats.avgLoadTime,
          clicks: stats.clicks,
          gaTracked: stats.gaTracked,
          errors: stats.errors
        };
      });
      
      Object.entries(data.funnelTracking).forEach(([funnelName, funnelData]) => {
        if (!aggregated.funnelAnalysis[funnelName]) {
          aggregated.funnelAnalysis[funnelName] = {
            hosts: {}
          };
        }
        aggregated.funnelAnalysis[funnelName].hosts[hostKey] = {
          started: funnelData.started,
          completed: funnelData.completed,
          completionRate: funnelData.completionRate,
          avgCompletionTime: funnelData.avgCompletionTime,
          abandonedCount: funnelData.abandonedCount
        };
      });
      
      if (data.topNavigationPaths) {
        aggregated.topPaths.push(...data.topNavigationPaths.map(p => ({
          ...p,
          host: hostKey
        })));
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Error processing ${file}:`), error.message);
    }
  });
  
  aggregated.overallStats.avgSessionDuration = aggregated.overallStats.completedSessions > 0
    ? Math.round(aggregated.overallStats.totalSessionDuration / aggregated.overallStats.completedSessions)
    : 0;
  
  aggregated.overallStats.avgPagesPerSession = aggregated.overallStats.completedSessions > 0
    ? (aggregated.overallStats.totalPageViews / aggregated.overallStats.completedSessions).toFixed(2)
    : 0;
  
  aggregated.overallStats.bounceRate = aggregated.overallStats.totalSessions > 0
    ? ((aggregated.overallStats.totalBounces / aggregated.overallStats.totalSessions) * 100).toFixed(2)
    : 0;
  
  aggregated.overallStats.navigationSuccessRate = aggregated.overallStats.totalSessions > 0
    ? ((aggregated.overallStats.completedSessions / aggregated.overallStats.totalSessions) * 100).toFixed(2)
    : 0;
  
  aggregated.topPaths.sort((a, b) => b.pageViews - a.pageViews);
  aggregated.topPaths = aggregated.topPaths.slice(0, 50);
  
  console.log(chalk.bold.green('\n\n📈 Aggregated Navigation Results\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.white(`Total Hosts Tested: ${aggregated.totalHosts}`));
  console.log(chalk.white(`Total Sessions: ${aggregated.overallStats.totalSessions}`));
  console.log(chalk.white(`Total Page Views: ${aggregated.overallStats.totalPageViews}`));
  console.log(chalk.green(`Navigation Success Rate: ${aggregated.overallStats.navigationSuccessRate}%`));
  console.log(chalk.white(`Avg Pages/Session: ${aggregated.overallStats.avgPagesPerSession}`));
  console.log(chalk.white(`Avg Session Duration: ${aggregated.overallStats.avgSessionDuration}s`));
  console.log(chalk.yellow(`Bounce Rate: ${aggregated.overallStats.bounceRate}%`));
  console.log(chalk.white(`Total GA Events: ${aggregated.overallStats.totalGAEvents}`));
  console.log(chalk.cyan('═'.repeat(70)));
  
  console.log(chalk.bold.yellow('\n🌐 Per-Host Navigation Performance:\n'));
  Object.entries(aggregated.hostStats).forEach(([host, stats]) => {
    console.log(chalk.cyan(`\n${host}`));
    console.log(chalk.white(`  Sessions: ${stats.totalSessions}`));
    console.log(chalk.green(`  Success Rate: ${stats.navigationSuccessRate}%`));
    console.log(chalk.white(`  Page Views: ${stats.totalPageViews}`));
    console.log(chalk.white(`  Avg Pages/Session: ${stats.avgPagesPerSession}`));
    console.log(chalk.white(`  Avg Duration: ${stats.avgSessionDuration}s`));
    console.log(chalk.yellow(`  Bounce Rate: ${stats.bounceRate}%`));
    console.log(chalk.white(`  GA Events: ${stats.gaEventsTracked}`));
  });
  
  console.log(chalk.bold.yellow('\n🔄 Funnel Performance Across Hosts:\n'));
  Object.entries(aggregated.funnelAnalysis).forEach(([funnelName, funnelData]) => {
    console.log(chalk.cyan(`\n${funnelName}`));
    Object.entries(funnelData.hosts).forEach(([host, stats]) => {
      console.log(chalk.white(`  ${host.replace('https://', '')}`));
      console.log(chalk.white(`    Started: ${stats.started} | Completed: ${stats.completed} | Rate: ${stats.completionRate}%`));
    });
  });
  
  console.log(chalk.bold.yellow('\n📄 Page Performance Comparison:\n'));
  Object.entries(aggregated.pageComparison)
    .sort(([, a], [, b]) => {
      const totalViewsA = Object.values(a.hosts).reduce((sum, h) => sum + h.views, 0);
      const totalViewsB = Object.values(b.hosts).reduce((sum, h) => sum + h.views, 0);
      return totalViewsB - totalViewsA;
    })
    .slice(0, 10)
    .forEach(([page, pageData]) => {
      console.log(chalk.cyan(`\n${pageData.name}`));
      Object.entries(pageData.hosts).forEach(([host, stats]) => {
        console.log(chalk.white(`  ${host.replace('https://', '')}: ${stats.views} views, ${stats.avgLoadTime}ms avg, ${stats.gaTracked} GA events`));
      });
    });
  
  fs.writeFileSync('aggregated-navigation-report.json', JSON.stringify(aggregated, null, 2));
  console.log(chalk.green('\n✅ Aggregated navigation results saved to aggregated-navigation-report.json'));
  
  generateFunnelComparison(aggregated);
  generateAggregatedNavigationHtmlReport(aggregated);
  generateNavigationSummary(aggregated);
}

function generateFunnelComparison(data) {
  const funnelComparison = {
    timestamp: new Date().toISOString(),
    totalHosts: data.totalHosts,
    funnels: {}
  };
  
  Object.entries(data.funnelAnalysis).forEach(([funnelName, funnelData]) => {
    const avgCompletionRate = Object.values(funnelData.hosts)
      .reduce((sum, h) => sum + h.completionRate, 0) / Object.keys(funnelData.hosts).length;
    
    const totalStarted = Object.values(funnelData.hosts).reduce((sum, h) => sum + h.started, 0);
    const totalCompleted = Object.values(funnelData.hosts).reduce((sum, h) => sum + h.completed, 0);
    
    funnelComparison.funnels[funnelName] = {
      avgCompletionRate: parseFloat(avgCompletionRate.toFixed(2)),
      totalStarted,
      totalCompleted,
      hosts: funnelData.hosts
    };
  });
  
  fs.writeFileSync('funnel-comparison.json', JSON.stringify(funnelComparison, null, 2));
  console.log(chalk.green('✅ Funnel comparison saved to funnel-comparison.json'));
  
  const funnelHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Funnel Comparison Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #2c3e50; margin-bottom: 30px; }
    .funnel { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .funnel-title { font-size: 20px; font-weight: bold; color: #2c3e50; margin-bottom: 15px; }
    .funnel-bar { background: #ecf0f1; height: 40px; border-radius: 20px; overflow: hidden; margin: 10px 0; position: relative; }
    .funnel-fill { background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%); height: 100%; display: flex; align-items: center; padding: 0 20px; color: white; font-weight: bold; }
    .host-comparison { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px; }
    .host-card { background: white; padding: 15px; border-radius: 6px; border-left: 3px solid #3498db; }
    .host-name { font-size: 14px; color: #7f8c8d; margin-bottom: 8px; }
    .host-rate { font-size: 24px; font-weight: bold; color: #2c3e50; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔄 Funnel Comparison Report</h1>
    <p style="color: #7f8c8d; margin-bottom: 30px;">Generated: ${funnelComparison.timestamp}</p>
    
    ${Object.entries(funnelComparison.funnels).map(([name, funnel]) => `
      <div class="funnel">
        <div class="funnel-title">${name}</div>
        <div style="margin-bottom: 15px;">
          <strong>Total:</strong> ${funnel.totalStarted} started, ${funnel.totalCompleted} completed
        </div>
        <div class="funnel-bar">
          <div class="funnel-fill" style="width: ${funnel.avgCompletionRate}%">
            ${funnel.avgCompletionRate}% Avg Completion
          </div>
        </div>
        <div class="host-comparison">
          ${Object.entries(funnel.hosts).map(([host, stats]) => `
            <div class="host-card">
              <div class="host-name">${host.replace('https://', '')}</div>
              <div class="host-rate">${stats.completionRate}%</div>
              <div style="font-size: 12px; color: #7f8c8d; margin-top: 5px;">
                ${stats.started} started, ${stats.completed} completed
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;
  
  fs.writeFileSync('funnel-comparison.html', funnelHtml);
  console.log(chalk.green('✅ Funnel comparison HTML saved to funnel-comparison.html'));
}

function generateAggregatedNavigationHtmlReport(data) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aggregated Navigation Test Report</title>
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
    th { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; font-weight: 600; text-transform: uppercase; font-size: 12px; }
    tr:hover { background: #f8f9fa; }
    .host-card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #3498db; }
    .host-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-warning { background: #fff3cd; color: #856404; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎯 Aggregated Navigation Test Report</h1>
    <div class="meta">
      <strong>Test Run:</strong> ${data.testRun}<br>
      <strong>Total Hosts:</strong> ${data.totalHosts}
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Sessions</div>
        <div class="stat-value">${data.overallStats.totalSessions}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Success Rate</div>
        <div class="stat-value">${data.overallStats.navigationSuccessRate}%</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Page Views</div>
        <div class="stat-value">${data.overallStats.totalPageViews}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Bounce Rate</div>
        <div class="stat-value">${data.overallStats.bounceRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Pages/Session</div>
        <div class="stat-value">${data.overallStats.avgPagesPerSession}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">GA Events</div>
        <div class="stat-value">${data.overallStats.totalGAEvents}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🌐 Host Performance</h2>
      ${Object.entries(data.hostStats).map(([host, stats]) => `
        <div class="host-card">
          <div class="host-title">${host}</div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">Sessions</div>
              <div style="font-size: 24px; font-weight: bold;">${stats.totalSessions}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">Success Rate</div>
              <div style="font-size: 24px; font-weight: bold; color: ${stats.navigationSuccessRate >= 95 ? '#27ae60' : '#f39c12'}">${stats.navigationSuccessRate}%</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">Page Views</div>
              <div style="font-size: 24px; font-weight: bold;">${stats.totalPageViews}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">Bounce Rate</div>
              <div style="font-size: 24px; font-weight: bold;">${stats.bounceRate}%</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">Avg Duration</div>
              <div style="font-size: 24px; font-weight: bold;">${stats.avgSessionDuration}s</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #7f8c8d;">GA Events</div>
              <div style="font-size: 24px; font-weight: bold;">${stats.gaEventsTracked}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2 class="section-title">📄 Top Pages Across All Hosts</h2>
      <table>
        <tr>
          <th>Page</th>
          <th>Total Views</th>
          <th>Avg Load Time</th>
          <th>Total Clicks</th>
          <th>GA Events</th>
        </tr>
        ${Object.entries(data.pageComparison)
          .sort(([, a], [, b]) => {
            const totalA = Object.values(a.hosts).reduce((sum, h) => sum + h.views, 0);
            const totalB = Object.values(b.hosts).reduce((sum, h) => sum + h.views, 0);
            return totalB - totalA;
          })
          .slice(0, 12)
          .map(([page, pageData]) => {
            const totalViews = Object.values(pageData.hosts).reduce((sum, h) => sum + h.views, 0);
            const avgLoadTime = Math.round(
              Object.values(pageData.hosts).reduce((sum, h) => sum + h.avgLoadTime, 0) / 
              Object.keys(pageData.hosts).length
            );
            const totalClicks = Object.values(pageData.hosts).reduce((sum, h) => sum + h.clicks, 0);
            const totalGA = Object.values(pageData.hosts).reduce((sum, h) => sum + h.gaTracked, 0);
            return `
              <tr>
                <td><strong>${pageData.name}</strong></td>
                <td>${totalViews}</td>
                <td>${avgLoadTime}ms</td>
                <td>${totalClicks}</td>
                <td><span class="badge badge-success">${totalGA}</span></td>
              </tr>
            `;
          }).join('')}
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">🔄 Funnel Performance</h2>
      <table>
        <tr>
          <th>Funnel</th>
          <th>Total Started</th>
          <th>Total Completed</th>
          <th>Avg Completion Rate</th>
        </tr>
        ${Object.entries(data.funnelAnalysis).map(([name, funnelData]) => {
          const totalStarted = Object.values(funnelData.hosts).reduce((sum, h) => sum + h.started, 0);
          const totalCompleted = Object.values(funnelData.hosts).reduce((sum, h) => sum + h.completed, 0);
          const avgRate = Object.values(funnelData.hosts).reduce((sum, h) => sum + h.completionRate, 0) / Object.keys(funnelData.hosts).length;
          return `
            <tr>
              <td><strong>${name}</strong></td>
              <td>${totalStarted}</td>
              <td>${totalCompleted}</td>
              <td><span class="badge ${avgRate >= 50 ? 'badge-success' : 'badge-warning'}">${avgRate.toFixed(1)}%</span></td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
  </div>
</body>
</html>
  `;
  
  fs.writeFileSync('aggregated-navigation-report.html', html);
  console.log(chalk.green('✅ Aggregated navigation HTML report saved to aggregated-navigation-report.html'));
}

function generateNavigationSummary(data) {
  console.log(chalk.bold.magenta('\n\n🔍 Navigation Test Summary\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  
  let allPassed = true;
  
  Object.entries(data.hostStats).forEach(([host, stats]) => {
    const passed = stats.navigationSuccessRate >= 95 && stats.bounceRate <= 50;
    allPassed = allPassed && passed;
    
    const statusIcon = passed ? '✅' : '⚠️';
    const statusColor = passed ? chalk.green : chalk.yellow;
    
    console.log(statusColor(`\n${statusIcon} ${host}`));
    console.log(chalk.white(`   Navigation Success: ${stats.navigationSuccessRate}% ${stats.navigationSuccessRate >= 95 ? '✅' : '❌'}`));
    console.log(chalk.white(`   Bounce Rate: ${stats.bounceRate}% ${stats.bounceRate <= 50 ? '✅' : '⚠️'}`));
    console.log(chalk.white(`   Avg Pages/Session: ${stats.avgPagesPerSession}`));
    console.log(chalk.white(`   GA Events Tracked: ${stats.gaEventsTracked}`));
    console.log(chalk.white(`   Verdict: ${passed ? 'PASS' : 'NEEDS REVIEW'}`));
  });
  
  console.log(chalk.cyan('\n' + '═'.repeat(70)));
  
  if (allPassed) {
    console.log(chalk.bold.green('\n🎉 All hosts passed navigation verification!\n'));
  } else {
    console.log(chalk.bold.yellow('\n⚠️  Some hosts need review. Check individual reports for details.\n'));
  }
}

aggregateNavigationResults();
