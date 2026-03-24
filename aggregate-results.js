const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function findJsonFiles(dir) {
  const files = [];
  
  function traverse(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (item.startsWith('test-results-') && item.endsWith('.json')) {
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

function aggregateResults() {
  console.log(chalk.bold.cyan('\n📊 Aggregating Load Test Results\n'));
  
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  
  if (!fs.existsSync(artifactsDir)) {
    console.log(chalk.yellow('⚠️  No artifacts directory found. Checking current directory...'));
    const currentDirFiles = findJsonFiles(process.cwd());
    
    if (currentDirFiles.length === 0) {
      console.log(chalk.red('❌ No test result files found.'));
      process.exit(1);
    }
  }
  
  const jsonFiles = findJsonFiles(artifactsDir).concat(findJsonFiles(process.cwd()));
  
  if (jsonFiles.length === 0) {
    console.log(chalk.red('❌ No test result JSON files found.'));
    process.exit(1);
  }
  
  console.log(chalk.green(`✅ Found ${jsonFiles.length} test result file(s)\n`));
  
  const aggregated = {
    testRun: new Date().toISOString(),
    totalHosts: 0,
    hostStats: {},
    overallStats: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDuration: 0,
      allResponseTimes: []
    },
    endpointComparison: {},
    statusCodeDistribution: {}
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
        totalRequests: data.totalRequests,
        successfulRequests: data.successfulRequests,
        failedRequests: data.failedRequests,
        successRate: data.successRate,
        requestsPerSecond: data.requestsPerSecond,
        responseTimes: data.responseTimes,
        statusCodes: data.statusCodes,
        endpointStats: data.endpointStats,
        errorCount: data.errors ? data.errors.length : 0
      };
      
      aggregated.overallStats.totalRequests += data.totalRequests;
      aggregated.overallStats.successfulRequests += data.successfulRequests;
      aggregated.overallStats.failedRequests += data.failedRequests;
      aggregated.overallStats.totalDuration += data.duration;
      
      Object.entries(data.statusCodes).forEach(([code, count]) => {
        aggregated.statusCodeDistribution[code] = 
          (aggregated.statusCodeDistribution[code] || 0) + count;
      });
      
      Object.entries(data.endpointStats).forEach(([endpoint, stats]) => {
        if (!aggregated.endpointComparison[endpoint]) {
          aggregated.endpointComparison[endpoint] = {};
        }
        aggregated.endpointComparison[endpoint][hostKey] = {
          requests: stats.requests,
          success: stats.success,
          failures: stats.failures,
          avgResponseTime: stats.avgResponseTime
        };
      });
      
    } catch (error) {
      console.error(chalk.red(`❌ Error processing ${file}:`), error.message);
    }
  });
  
  const overallSuccessRate = aggregated.overallStats.totalRequests > 0
    ? ((aggregated.overallStats.successfulRequests / aggregated.overallStats.totalRequests) * 100).toFixed(2)
    : 0;
  
  aggregated.overallStats.successRate = parseFloat(overallSuccessRate);
  aggregated.overallStats.avgRequestsPerSecond = 
    (aggregated.overallStats.totalRequests / (aggregated.overallStats.totalDuration * 60)).toFixed(2);
  
  console.log(chalk.bold.green('\n\n📈 Aggregated Results Summary\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.white(`Total Hosts Tested: ${aggregated.totalHosts}`));
  console.log(chalk.white(`Total Requests: ${aggregated.overallStats.totalRequests.toLocaleString()}`));
  console.log(chalk.green(`Successful Requests: ${aggregated.overallStats.successfulRequests.toLocaleString()} (${overallSuccessRate}%)`));
  console.log(chalk.red(`Failed Requests: ${aggregated.overallStats.failedRequests.toLocaleString()}`));
  console.log(chalk.white(`Average Requests/sec: ${aggregated.overallStats.avgRequestsPerSecond}`));
  console.log(chalk.cyan('═'.repeat(70)));
  
  console.log(chalk.bold.yellow('\n🌐 Per-Host Performance:\n'));
  Object.entries(aggregated.hostStats).forEach(([host, stats]) => {
    console.log(chalk.cyan(`\n${host}`));
    console.log(chalk.white(`  Requests: ${stats.totalRequests.toLocaleString()}`));
    console.log(chalk.green(`  Success Rate: ${stats.successRate}%`));
    console.log(chalk.white(`  Avg Response: ${stats.responseTimes.average}ms`));
    console.log(chalk.white(`  P95: ${stats.responseTimes.p95}ms`));
    console.log(chalk.white(`  P99: ${stats.responseTimes.p99}ms`));
    console.log(chalk.white(`  Requests/sec: ${stats.requestsPerSecond}`));
  });
  
  console.log(chalk.bold.yellow('\n🎯 Endpoint Comparison Across Hosts:\n'));
  Object.entries(aggregated.endpointComparison).forEach(([endpoint, hosts]) => {
    console.log(chalk.cyan(`\n${endpoint}`));
    Object.entries(hosts).forEach(([host, stats]) => {
      const successRate = stats.requests > 0 
        ? ((stats.success / stats.requests) * 100).toFixed(2)
        : 0;
      console.log(chalk.white(`  ${host.replace('https://', '')}`));
      console.log(chalk.white(`    Requests: ${stats.requests} | Success: ${successRate}% | Avg: ${stats.avgResponseTime}ms`));
    });
  });
  
  console.log(chalk.bold.yellow('\n📊 Overall Status Code Distribution:\n'));
  Object.entries(aggregated.statusCodeDistribution)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([code, count]) => {
      const percentage = ((count / aggregated.overallStats.totalRequests) * 100).toFixed(2);
      const color = code.startsWith('2') ? chalk.green : 
                    code.startsWith('3') ? chalk.blue : 
                    code.startsWith('4') ? chalk.yellow : chalk.red;
      console.log(color(`  ${code}: ${count.toLocaleString()} (${percentage}%)`));
    });
  
  fs.writeFileSync('aggregated-report.json', JSON.stringify(aggregated, null, 2));
  console.log(chalk.green('\n✅ Aggregated results saved to aggregated-report.json'));
  
  generateAggregatedHtmlReport(aggregated);
  
  generateMatrixVerificationReport(aggregated);
}

function generateAggregatedHtmlReport(data) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aggregated Load Test Report - Matrix Verification</title>
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
    .success-rate { color: #27ae60; font-weight: bold; }
    .failure-rate { color: #e74c3c; font-weight: bold; }
    .host-card { background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #3498db; }
    .host-title { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
    .host-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .host-stat { background: white; padding: 12px; border-radius: 6px; }
    .host-stat-label { font-size: 12px; color: #7f8c8d; margin-bottom: 5px; }
    .host-stat-value { font-size: 20px; font-weight: bold; color: #2c3e50; }
    .comparison-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .endpoint-card { background: #f8f9fa; padding: 15px; border-radius: 8px; }
    .endpoint-title { font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Aggregated Load Test Report</h1>
    <div class="meta">
      <strong>Test Run:</strong> ${data.testRun}<br>
      <strong>Total Hosts Tested:</strong> ${data.totalHosts}<br>
      <strong>Matrix Verification:</strong> Complete
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value">${data.overallStats.totalRequests.toLocaleString()}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Overall Success Rate</div>
        <div class="stat-value">${data.overallStats.successRate}%</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Avg Requests/Sec</div>
        <div class="stat-value">${data.overallStats.avgRequestsPerSecond}</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Failed Requests</div>
        <div class="stat-value">${data.overallStats.failedRequests.toLocaleString()}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">🌐 Host Performance Matrix</h2>
      ${Object.entries(data.hostStats).map(([host, stats]) => `
        <div class="host-card">
          <div class="host-title">${host}</div>
          <div class="host-stats">
            <div class="host-stat">
              <div class="host-stat-label">Requests</div>
              <div class="host-stat-value">${stats.totalRequests.toLocaleString()}</div>
            </div>
            <div class="host-stat">
              <div class="host-stat-label">Success Rate</div>
              <div class="host-stat-value" style="color: ${stats.successRate >= 95 ? '#27ae60' : stats.successRate >= 80 ? '#f39c12' : '#e74c3c'}">${stats.successRate}%</div>
            </div>
            <div class="host-stat">
              <div class="host-stat-label">Avg Response</div>
              <div class="host-stat-value">${stats.responseTimes.average}ms</div>
            </div>
            <div class="host-stat">
              <div class="host-stat-label">P95</div>
              <div class="host-stat-value">${stats.responseTimes.p95}ms</div>
            </div>
            <div class="host-stat">
              <div class="host-stat-label">P99</div>
              <div class="host-stat-value">${stats.responseTimes.p99}ms</div>
            </div>
            <div class="host-stat">
              <div class="host-stat-label">Req/Sec</div>
              <div class="host-stat-value">${stats.requestsPerSecond}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <h2 class="section-title">🎯 Endpoint Performance Comparison</h2>
      <div class="comparison-grid">
        ${Object.entries(data.endpointComparison).map(([endpoint, hosts]) => `
          <div class="endpoint-card">
            <div class="endpoint-title">${endpoint}</div>
            ${Object.entries(hosts).map(([host, stats]) => {
              const successRate = stats.requests > 0 ? ((stats.success / stats.requests) * 100).toFixed(1) : 0;
              const badgeClass = successRate >= 95 ? 'badge-success' : successRate >= 80 ? 'badge-warning' : 'badge-danger';
              return `
                <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 4px;">
                  <div style="font-size: 12px; color: #7f8c8d; margin-bottom: 4px;">${host.replace('https://', '')}</div>
                  <span class="badge ${badgeClass}">${successRate}% success</span>
                  <span class="badge badge-info">${stats.avgResponseTime}ms</span>
                  <div style="font-size: 11px; color: #95a5a6; margin-top: 4px;">${stats.requests} requests</div>
                </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">📊 Status Code Distribution</h2>
      <table>
        <tr>
          <th>Status Code</th>
          <th>Count</th>
          <th>Percentage</th>
          <th>Visual</th>
        </tr>
        ${Object.entries(data.statusCodeDistribution)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([code, count]) => {
            const percentage = ((count / data.overallStats.totalRequests) * 100).toFixed(2);
            const barWidth = Math.min(percentage * 5, 100);
            const color = code.startsWith('2') ? '#27ae60' : code.startsWith('3') ? '#3498db' : code.startsWith('4') ? '#f39c12' : '#e74c3c';
            return `
              <tr>
                <td><strong>${code}</strong></td>
                <td>${count.toLocaleString()}</td>
                <td>${percentage}%</td>
                <td><div style="background: ${color}; width: ${barWidth}%; height: 20px; border-radius: 4px;"></div></td>
              </tr>
            `;
          }).join('')}
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">✅ Matrix Verification Summary</h2>
      <table>
        <tr>
          <th>Host</th>
          <th>Status</th>
          <th>Requests</th>
          <th>Success Rate</th>
          <th>Avg Response</th>
          <th>Verdict</th>
        </tr>
        ${Object.entries(data.hostStats).map(([host, stats]) => {
          const status = stats.successRate >= 95 ? '🟢 Excellent' : stats.successRate >= 80 ? '🟡 Good' : '🔴 Poor';
          const verdict = stats.successRate >= 95 && stats.responseTimes.average < 1000 ? '✅ PASS' : '⚠️ REVIEW';
          return `
            <tr>
              <td>${host}</td>
              <td>${status}</td>
              <td>${stats.totalRequests.toLocaleString()}</td>
              <td style="color: ${stats.successRate >= 95 ? '#27ae60' : stats.successRate >= 80 ? '#f39c12' : '#e74c3c'}">${stats.successRate}%</td>
              <td>${stats.responseTimes.average}ms</td>
              <td><strong>${verdict}</strong></td>
            </tr>
          `;
        }).join('')}
      </table>
    </div>
  </div>
</body>
</html>
  `;
  
  fs.writeFileSync('aggregated-report.html', html);
  console.log(chalk.green('✅ Aggregated HTML report saved to aggregated-report.html'));
}

function generateMatrixVerificationReport(data) {
  console.log(chalk.bold.magenta('\n\n🔍 Matrix Verification Report\n'));
  console.log(chalk.cyan('═'.repeat(70)));
  
  let allPassed = true;
  
  Object.entries(data.hostStats).forEach(([host, stats]) => {
    const passed = stats.successRate >= 95 && stats.responseTimes.average < 1000;
    allPassed = allPassed && passed;
    
    const statusIcon = passed ? '✅' : '⚠️';
    const statusColor = passed ? chalk.green : chalk.yellow;
    
    console.log(statusColor(`\n${statusIcon} ${host}`));
    console.log(chalk.white(`   Success Rate: ${stats.successRate}% ${stats.successRate >= 95 ? '✅' : '❌'}`));
    console.log(chalk.white(`   Avg Response: ${stats.responseTimes.average}ms ${stats.responseTimes.average < 1000 ? '✅' : '❌'}`));
    console.log(chalk.white(`   P95 Response: ${stats.responseTimes.p95}ms`));
    console.log(chalk.white(`   Total Requests: ${stats.totalRequests.toLocaleString()}`));
    console.log(chalk.white(`   Verdict: ${passed ? 'PASS' : 'NEEDS REVIEW'}`));
  });
  
  console.log(chalk.cyan('\n' + '═'.repeat(70)));
  
  if (allPassed) {
    console.log(chalk.bold.green('\n🎉 All hosts passed the matrix verification!\n'));
  } else {
    console.log(chalk.bold.yellow('\n⚠️  Some hosts need review. Check individual reports for details.\n'));
  }
}

aggregateResults();
