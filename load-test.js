const axios = require('axios');
const pLimit = require('p-limit');
const cliProgress = require('cli-progress');
const chalk = require('chalk');
const fs = require('fs');

const TARGET_HOST = process.env.TARGET_HOST;
const DURATION_MINUTES = parseInt(process.env.DURATION_MINUTES || '5');
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '100');

const endpoints = [
  '/',
  '/about_us.html',
  '/about_us_2.html',
  '/california_disclosures.html',
  '/faqs.html',
  '/how_it_works.html',
  '/oppu.html',
  '/personal_loans.html',
  '/privacy_policy.html',
  '/rates_terms.html',
  '/resources.html',
  '/terms_of_use.html'
];

const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  statusCodes: {},
  endpointStats: {},
  errors: [],
  startTime: null,
  endTime: null
};

endpoints.forEach(endpoint => {
  stats.endpointStats[endpoint] = {
    requests: 0,
    success: 0,
    failures: 0,
    responseTimes: [],
    errors: []
  };
});

const progressBar = new cliProgress.SingleBar({
  format: chalk.cyan('{bar}') + ' | {percentage}% | {value}/{total} Requests | Success: {success} | Failed: {failed} | Avg: {avgTime}ms',
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});

async function makeRequest(url, endpoint) {
  const fullUrl = `${url}${endpoint}`;
  const startTime = Date.now();
  
  try {
    const response = await axios.get(fullUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'LoadTest-Bot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      validateStatus: (status) => status < 500
    });
    
    const responseTime = Date.now() - startTime;
    
    stats.totalRequests++;
    stats.responseTimes.push(responseTime);
    stats.endpointStats[endpoint].requests++;
    stats.endpointStats[endpoint].responseTimes.push(responseTime);
    
    const statusCode = response.status;
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
    
    if (statusCode >= 200 && statusCode < 400) {
      stats.successfulRequests++;
      stats.endpointStats[endpoint].success++;
    } else {
      stats.failedRequests++;
      stats.endpointStats[endpoint].failures++;
      stats.endpointStats[endpoint].errors.push({
        statusCode,
        time: new Date().toISOString()
      });
    }
    
    return { success: true, responseTime, statusCode };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    stats.totalRequests++;
    stats.failedRequests++;
    stats.endpointStats[endpoint].requests++;
    stats.endpointStats[endpoint].failures++;
    
    const errorInfo = {
      message: error.message,
      code: error.code,
      time: new Date().toISOString(),
      endpoint
    };
    
    stats.errors.push(errorInfo);
    stats.endpointStats[endpoint].errors.push(errorInfo);
    
    return { success: false, responseTime, error: error.message };
  }
}

async function runLoadTest() {
  console.log(chalk.bold.green('\n🚀 Starting Load Test\n'));
  console.log(chalk.yellow(`Target: ${TARGET_HOST}`));
  console.log(chalk.yellow(`Duration: ${DURATION_MINUTES} minutes`));
  console.log(chalk.yellow(`Concurrent Users: ${CONCURRENT_USERS}`));
  console.log(chalk.yellow(`Endpoints: ${endpoints.length}`));
  console.log(chalk.yellow(`Expected Requests: ~${Math.floor((DURATION_MINUTES * 60 * CONCURRENT_USERS) / 2)}\n`));
  
  stats.startTime = new Date().toISOString();
  const endTime = Date.now() + (DURATION_MINUTES * 60 * 1000);
  
  const limit = pLimit(CONCURRENT_USERS);
  const requests = [];
  
  progressBar.start(1000, 0, {
    success: 0,
    failed: 0,
    avgTime: 0
  });
  
  let requestCount = 0;
  
  while (Date.now() < endTime) {
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    
    const request = limit(() => makeRequest(TARGET_HOST, endpoint));
    requests.push(request);
    requestCount++;
    
    if (requestCount % 10 === 0) {
      const avgTime = stats.responseTimes.length > 0 
        ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
        : 0;
      
      progressBar.update(stats.totalRequests, {
        success: stats.successfulRequests,
        failed: stats.failedRequests,
        avgTime
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  }
  
  console.log(chalk.blue('\n\n⏳ Waiting for remaining requests to complete...\n'));
  await Promise.all(requests);
  
  progressBar.stop();
  stats.endTime = new Date().toISOString();
  
  generateReport();
}

function generateReport() {
  const avgResponseTime = stats.responseTimes.length > 0
    ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
    : 0;
  
  const minResponseTime = stats.responseTimes.length > 0
    ? Math.min(...stats.responseTimes)
    : 0;
  
  const maxResponseTime = stats.responseTimes.length > 0
    ? Math.max(...stats.responseTimes)
    : 0;
  
  const sortedTimes = [...stats.responseTimes].sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
  
  const successRate = ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2);
  
  console.log(chalk.bold.green('\n\n📊 Load Test Results\n'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log(chalk.white(`Host: ${TARGET_HOST}`));
  console.log(chalk.white(`Duration: ${DURATION_MINUTES} minutes`));
  console.log(chalk.white(`Start Time: ${stats.startTime}`));
  console.log(chalk.white(`End Time: ${stats.endTime}`));
  console.log(chalk.cyan('═'.repeat(60)));
  
  console.log(chalk.bold.yellow('\n📈 Request Statistics:'));
  console.log(chalk.white(`  Total Requests: ${stats.totalRequests}`));
  console.log(chalk.green(`  Successful: ${stats.successfulRequests} (${successRate}%)`));
  console.log(chalk.red(`  Failed: ${stats.failedRequests} (${(100 - successRate).toFixed(2)}%)`));
  console.log(chalk.white(`  Requests/sec: ${(stats.totalRequests / (DURATION_MINUTES * 60)).toFixed(2)}`));
  
  console.log(chalk.bold.yellow('\n⏱️  Response Times:'));
  console.log(chalk.white(`  Average: ${avgResponseTime}ms`));
  console.log(chalk.white(`  Min: ${minResponseTime}ms`));
  console.log(chalk.white(`  Max: ${maxResponseTime}ms`));
  console.log(chalk.white(`  P50 (Median): ${p50}ms`));
  console.log(chalk.white(`  P95: ${p95}ms`));
  console.log(chalk.white(`  P99: ${p99}ms`));
  
  console.log(chalk.bold.yellow('\n📋 Status Code Distribution:'));
  Object.entries(stats.statusCodes)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([code, count]) => {
      const color = code.startsWith('2') ? chalk.green : 
                    code.startsWith('3') ? chalk.blue : 
                    code.startsWith('4') ? chalk.yellow : chalk.red;
      console.log(color(`  ${code}: ${count} (${((count / stats.totalRequests) * 100).toFixed(2)}%)`));
    });
  
  console.log(chalk.bold.yellow('\n🎯 Endpoint Statistics:'));
  Object.entries(stats.endpointStats)
    .sort(([, a], [, b]) => b.requests - a.requests)
    .forEach(([endpoint, endpointStat]) => {
      const avgEndpointTime = endpointStat.responseTimes.length > 0
        ? Math.round(endpointStat.responseTimes.reduce((a, b) => a + b, 0) / endpointStat.responseTimes.length)
        : 0;
      
      const endpointSuccessRate = endpointStat.requests > 0
        ? ((endpointStat.success / endpointStat.requests) * 100).toFixed(2)
        : 0;
      
      console.log(chalk.cyan(`\n  ${endpoint}`));
      console.log(chalk.white(`    Requests: ${endpointStat.requests}`));
      console.log(chalk.green(`    Success: ${endpointStat.success} (${endpointSuccessRate}%)`));
      console.log(chalk.red(`    Failures: ${endpointStat.failures}`));
      console.log(chalk.white(`    Avg Response: ${avgEndpointTime}ms`));
    });
  
  if (stats.errors.length > 0) {
    console.log(chalk.bold.red('\n❌ Top Errors:'));
    const errorCounts = {};
    stats.errors.forEach(err => {
      const key = `${err.message} (${err.endpoint})`;
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });
    
    Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .forEach(([error, count]) => {
        console.log(chalk.red(`  ${error}: ${count} occurrences`));
      });
  }
  
  const jsonReport = {
    host: TARGET_HOST,
    duration: DURATION_MINUTES,
    startTime: stats.startTime,
    endTime: stats.endTime,
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    successRate: parseFloat(successRate),
    requestsPerSecond: parseFloat((stats.totalRequests / (DURATION_MINUTES * 60)).toFixed(2)),
    responseTimes: {
      average: avgResponseTime,
      min: minResponseTime,
      max: maxResponseTime,
      p50,
      p95,
      p99
    },
    statusCodes: stats.statusCodes,
    endpointStats: Object.fromEntries(
      Object.entries(stats.endpointStats).map(([endpoint, stat]) => [
        endpoint,
        {
          requests: stat.requests,
          success: stat.success,
          failures: stat.failures,
          avgResponseTime: stat.responseTimes.length > 0
            ? Math.round(stat.responseTimes.reduce((a, b) => a + b, 0) / stat.responseTimes.length)
            : 0
        }
      ])
    ),
    errors: stats.errors.slice(0, 100)
  };
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const hostname = TARGET_HOST.replace(/https?:\/\//, '').replace(/\//g, '-');
  const jsonFilename = `test-results-${hostname}-${timestamp}.json`;
  
  fs.writeFileSync(jsonFilename, JSON.stringify(jsonReport, null, 2));
  console.log(chalk.green(`\n✅ Results saved to ${jsonFilename}`));
  
  generateHtmlReport(jsonReport, hostname, timestamp);
}

function generateHtmlReport(data, hostname, timestamp) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Report - ${data.host}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); padding: 30px; }
    h1 { color: #2c3e50; margin-bottom: 10px; }
    .meta { color: #7f8c8d; margin-bottom: 30px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; }
    .stat-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
    .stat-card.warning { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
    .stat-card.info { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
    .stat-label { font-size: 14px; opacity: 0.9; margin-bottom: 5px; }
    .stat-value { font-size: 32px; font-weight: bold; }
    .section { margin-bottom: 30px; }
    .section-title { color: #2c3e50; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #3498db; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { background: #3498db; color: white; font-weight: 600; }
    tr:hover { background: #f8f9fa; }
    .success-rate { color: #27ae60; font-weight: bold; }
    .failure-rate { color: #e74c3c; font-weight: bold; }
    .chart { height: 300px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Load Test Report</h1>
    <div class="meta">
      <strong>Host:</strong> ${data.host}<br>
      <strong>Duration:</strong> ${data.duration} minutes<br>
      <strong>Start:</strong> ${data.startTime}<br>
      <strong>End:</strong> ${data.endTime}
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value">${data.totalRequests.toLocaleString()}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Success Rate</div>
        <div class="stat-value">${data.successRate}%</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">Avg Response Time</div>
        <div class="stat-value">${data.responseTimes.average}ms</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Requests/Second</div>
        <div class="stat-value">${data.requestsPerSecond}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">⏱️ Response Time Percentiles</h2>
      <table>
        <tr>
          <th>Metric</th>
          <th>Value</th>
        </tr>
        <tr><td>Minimum</td><td>${data.responseTimes.min}ms</td></tr>
        <tr><td>P50 (Median)</td><td>${data.responseTimes.p50}ms</td></tr>
        <tr><td>Average</td><td>${data.responseTimes.average}ms</td></tr>
        <tr><td>P95</td><td>${data.responseTimes.p95}ms</td></tr>
        <tr><td>P99</td><td>${data.responseTimes.p99}ms</td></tr>
        <tr><td>Maximum</td><td>${data.responseTimes.max}ms</td></tr>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">📋 Status Code Distribution</h2>
      <table>
        <tr>
          <th>Status Code</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
        ${Object.entries(data.statusCodes).map(([code, count]) => `
          <tr>
            <td>${code}</td>
            <td>${count.toLocaleString()}</td>
            <td>${((count / data.totalRequests) * 100).toFixed(2)}%</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">🎯 Endpoint Performance</h2>
      <table>
        <tr>
          <th>Endpoint</th>
          <th>Requests</th>
          <th>Success</th>
          <th>Failures</th>
          <th>Avg Response</th>
        </tr>
        ${Object.entries(data.endpointStats).map(([endpoint, stats]) => `
          <tr>
            <td>${endpoint}</td>
            <td>${stats.requests.toLocaleString()}</td>
            <td class="success-rate">${stats.success.toLocaleString()}</td>
            <td class="failure-rate">${stats.failures.toLocaleString()}</td>
            <td>${stats.avgResponseTime}ms</td>
          </tr>
        `).join('')}
      </table>
    </div>

    ${data.errors.length > 0 ? `
    <div class="section">
      <h2 class="section-title">❌ Recent Errors (Last 100)</h2>
      <table>
        <tr>
          <th>Time</th>
          <th>Endpoint</th>
          <th>Error</th>
        </tr>
        ${data.errors.slice(0, 20).map(err => `
          <tr>
            <td>${new Date(err.time).toLocaleTimeString()}</td>
            <td>${err.endpoint}</td>
            <td>${err.message}</td>
          </tr>
        `).join('')}
      </table>
    </div>
    ` : ''}
  </div>
</body>
</html>
  `;
  
  const htmlFilename = `test-report-${hostname}-${timestamp}.html`;
  fs.writeFileSync(htmlFilename, html);
  console.log(chalk.green(`✅ HTML report saved to ${htmlFilename}\n`));
}

runLoadTest().catch(error => {
  console.error(chalk.red('\n❌ Load test failed:'), error);
  process.exit(1);
});
