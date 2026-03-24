# Load Testing Suite with Matrix Verification

Real-time load testing solution for generating thousands of impressions across multiple hostnames with comprehensive matrix session verification.

## 🎯 Features

- **Multi-Host Testing**: Tests 3 hostnames simultaneously using GitHub Actions matrix strategy
- **High Concurrency**: Supports 1000+ concurrent users
- **Real-time Impressions**: Generates continuous traffic to simulate real user behavior
- **12 Endpoint Coverage**: Tests all critical pages across each hostname
- **Matrix Verification**: Validates performance across all host/endpoint combinations
- **Detailed Reporting**: JSON and HTML reports with comprehensive metrics
- **Automated CI/CD**: GitHub Actions workflow for scheduled and on-demand testing

## 🌐 Target Hosts

- `https://opp-loans.web.app`
- `https://opploans.static2.website`
- `https://opploans.netlify.app`

## 📄 Tested Endpoints

- `/` - Homepage
- `/about_us.html`
- `/about_us_2.html`
- `/california_disclosures.html`
- `/faqs.html`
- `/how_it_works.html`
- `/oppu.html`
- `/personal_loans.html`
- `/privacy_policy.html`
- `/rates_terms.html`
- `/resources.html`
- `/terms_of_use.html`

## 🚀 Usage

### Local Testing

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Load Test for Single Host**
   ```bash
   TARGET_HOST=https://opp-loans.web.app DURATION_MINUTES=5 CONCURRENT_USERS=100 node load-test.js
   ```

3. **Aggregate Results**
   ```bash
   node aggregate-results.js
   ```

### GitHub Actions

#### Manual Trigger
1. Go to Actions tab in your repository
2. Select "Realtime Load Testing & Matrix Verification"
3. Click "Run workflow"
4. Configure parameters:
   - **Duration**: Test duration in minutes (default: 5)
   - **Concurrent Users**: Number of simultaneous users (default: 100)

#### Scheduled Runs
- Automatically runs every 6 hours
- Modify schedule in `.github/workflows/load-test.yml`

## 📊 Reports

### Individual Host Reports
Each test generates:
- `test-results-{hostname}-{timestamp}.json` - Raw JSON data
- `test-report-{hostname}-{timestamp}.html` - Visual HTML report

### Aggregated Reports
After all hosts complete:
- `aggregated-report.json` - Combined metrics
- `aggregated-report.html` - Matrix verification dashboard

### Metrics Included
- **Request Statistics**: Total, success, failure counts
- **Response Times**: Min, max, average, P50, P95, P99
- **Status Codes**: Distribution across all requests
- **Endpoint Performance**: Per-endpoint metrics for each host
- **Error Analysis**: Top errors and failure patterns
- **Matrix Verification**: Pass/fail status for each host

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TARGET_HOST` | Target hostname to test | Required |
| `DURATION_MINUTES` | Test duration in minutes | 5 |
| `CONCURRENT_USERS` | Number of concurrent users | 100 |

### Customization

**Modify Endpoints**: Edit the `endpoints` array in `load-test.js`

```javascript
const endpoints = [
  '/',
  '/your-custom-page.html',
  // Add more endpoints
];
```

**Adjust Concurrency**: Change `CONCURRENT_USERS` to increase/decrease load

**Test Duration**: Modify `DURATION_MINUTES` for longer/shorter tests

## 📈 Performance Criteria

### Matrix Verification Pass Criteria
- ✅ Success Rate: ≥ 95%
- ✅ Average Response Time: < 1000ms
- ✅ P95 Response Time: < 2000ms

### Status Indicators
- 🟢 **Excellent**: Success rate ≥ 95%
- 🟡 **Good**: Success rate ≥ 80%
- 🔴 **Poor**: Success rate < 80%

## 🔧 Troubleshooting

### High Failure Rate
- Check target host availability
- Verify network connectivity
- Review error logs in JSON reports

### Slow Response Times
- Reduce concurrent users
- Check server capacity
- Review P95/P99 metrics for outliers

### GitHub Actions Timeout
- Reduce test duration
- Lower concurrent users
- Split into multiple workflow runs

## 📦 Dependencies

- **axios**: HTTP client for making requests
- **p-limit**: Concurrency control
- **cli-progress**: Progress bar visualization
- **chalk**: Terminal output styling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 📝 License

ISC

## 🎉 Results Interpretation

### Success Metrics
- **Total Requests**: Number of HTTP requests made
- **Success Rate**: Percentage of successful responses (2xx, 3xx)
- **Requests/Second**: Throughput measurement
- **Response Times**: Latency measurements at various percentiles

### Matrix Verification
The aggregated report shows a matrix of all hosts vs all endpoints, allowing you to:
- Compare performance across different hosting platforms
- Identify problematic endpoints
- Verify consistent behavior across deployments
- Validate CDN and edge performance

## 🔍 Example Output

```
🚀 Starting Load Test

Target: https://opp-loans.web.app
Duration: 5 minutes
Concurrent Users: 100
Endpoints: 12
Expected Requests: ~15000

████████████████████████████████ | 100% | 15234/15234 Requests | Success: 15100 | Failed: 134 | Avg: 245ms

📊 Load Test Results
════════════════════════════════════════════════════════════
Host: https://opp-loans.web.app
Duration: 5 minutes
Success Rate: 99.12%
Average Response Time: 245ms
P95: 450ms
P99: 680ms
════════════════════════════════════════════════════════════
```

## 🎯 Use Cases

- **Pre-deployment Testing**: Validate performance before production release
- **Capacity Planning**: Determine server limits and scaling requirements
- **CDN Verification**: Compare performance across different hosting providers
- **Regression Testing**: Ensure performance doesn't degrade over time
- **SLA Monitoring**: Verify service level agreements are met
