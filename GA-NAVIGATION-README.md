# Google Analytics Navigation & Funnel Testing

Real user behavior simulation with Google Analytics tracking, click-through navigation, and comprehensive funnel analysis across multiple production sites.

## 🎯 Overview

This testing suite simulates real user sessions by:
- **Opening actual browser instances** using Playwright
- **Clicking random links** on pages to navigate naturally
- **Tracking Google Analytics events** in real-time
- **Recording user journeys** through predefined funnels
- **Measuring engagement metrics** like session duration, bounce rate, and pages per session

## 🆚 Difference from Load Testing

| Feature | Load Testing | GA Navigation Testing |
|---------|-------------|----------------------|
| **Purpose** | Test server capacity | Test user experience & analytics |
| **Method** | HTTP requests only | Real browser automation |
| **Clicks** | None | Random link clicks |
| **GA Tracking** | Not captured | Fully tracked |
| **JavaScript** | Not executed | Fully executed |
| **Funnel Analysis** | No | Yes |
| **Session Simulation** | Basic | Realistic user behavior |

## 🌐 Target Hosts

- `https://opp-loans.web.app`
- `https://opploans.static2.website`
- `https://opploans.netlify.app`

## 📊 Tracked Funnels

### Primary Conversion Funnels
1. **Homepage to Personal Loans** - Direct conversion path
2. **Homepage → How It Works → Personal Loans** - Educational journey
3. **Homepage → About → Personal Loans** - Trust-building path
4. **Homepage → FAQs → Personal Loans** - Question resolution path

### Secondary Funnels
5. **Resources Journey** - Content engagement
6. **Information Gathering** - Research behavior

## 🚀 Usage

### Local Testing

1. **Install Dependencies**
   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Run GA Navigation Test**
   ```bash
   TARGET_HOST=https://opp-loans.web.app DURATION_MINUTES=10 CONCURRENT_SESSIONS=50 SESSION_DEPTH=5 node ga-navigation-test.js
   ```

3. **Aggregate Results**
   ```bash
   node aggregate-navigation-results.js
   ```

### GitHub Actions

#### Manual Trigger
1. Go to Actions tab
2. Select "Google Analytics Navigation & Funnel Testing"
3. Click "Run workflow"
4. Configure:
   - **Duration**: Test duration in minutes (default: 10)
   - **Concurrent Sessions**: Simultaneous user sessions (default: 50)
   - **Session Depth**: Average pages per session (default: 5)

#### Scheduled Runs
- Automatically runs every 8 hours
- Modify in `.github/workflows/ga-navigation-test.yml`

## 📈 Metrics Collected

### Session Metrics
- **Total Sessions**: Number of user sessions simulated
- **Completed Sessions**: Successfully finished sessions
- **Failed Sessions**: Sessions with errors
- **Navigation Success Rate**: % of successful sessions
- **Bounce Rate**: % of single-page sessions
- **Avg Session Duration**: Time spent per session
- **Avg Pages/Session**: Pages viewed per session

### Page Metrics
- **Page Views**: Total views per page
- **Avg Load Time**: Page load performance
- **Clicks**: Link clicks per page
- **GA Events Tracked**: Analytics events captured
- **Errors**: Failed page loads

### Funnel Metrics
- **Started**: Users entering funnel
- **Completed**: Users completing funnel
- **Completion Rate**: Success percentage
- **Avg Completion Time**: Time to complete
- **Abandoned**: Drop-off points

### Google Analytics Tracking
- **GA Events**: Total analytics events captured
- **Event Types**: pageview, click, custom events
- **DataLayer Push**: GTM events
- **gtag() Calls**: GA4 events
- **ga() Calls**: Universal Analytics events

## 🎭 User Behavior Simulation

### Realistic Actions
- **Random page selection** weighted by importance
- **Link clicking** on 70% of pages
- **Scroll behavior** with smooth scrolling
- **Variable timing** between actions (1-5 seconds)
- **Session depth variation** (1-12 pages)
- **Geographic simulation** (New York timezone/location)

### Browser Configuration
- **Viewport**: 1920x1080 (desktop)
- **User Agent**: Chrome 120 on Windows
- **Locale**: en-US
- **Timezone**: America/New_York
- **Geolocation**: New York City
- **Permissions**: Geolocation enabled

## 📊 Reports Generated

### Individual Host Reports
- `navigation-results-{hostname}-{timestamp}.json` - Raw session data
- `navigation-report-{hostname}-{timestamp}.html` - Visual report
- `funnel-analysis-{hostname}-{timestamp}.json` - Funnel metrics
- `screenshots/*.png` - Error screenshots (if any)
- `traces/*.zip` - Playwright traces for debugging

### Aggregated Reports
- `aggregated-navigation-report.json` - Combined metrics
- `aggregated-navigation-report.html` - Matrix dashboard
- `funnel-comparison.json` - Cross-host funnel data
- `funnel-comparison.html` - Visual funnel comparison

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TARGET_HOST` | Target hostname | Required |
| `DURATION_MINUTES` | Test duration | 10 |
| `CONCURRENT_SESSIONS` | Simultaneous sessions | 50 |
| `SESSION_DEPTH` | Avg pages per session | 5 |

### Page Weights

Pages have different selection weights to simulate realistic traffic:

```javascript
{ path: '/', weight: 10 },              // Homepage - highest
{ path: '/personal_loans.html', weight: 10 }, // Main CTA
{ path: '/how_it_works.html', weight: 9 },
{ path: '/about_us.html', weight: 8 },
{ path: '/faqs.html', weight: 7 },
// ... lower weights for legal pages
```

## 🎯 Quality Thresholds

### Pass Criteria
- ✅ Navigation Success Rate: ≥ 95%
- ✅ Bounce Rate: ≤ 50%
- ✅ Avg Pages/Session: ≥ 2
- ✅ GA Events Tracked: > 0 per page

### Status Indicators
- 🟢 **Excellent**: Success ≥ 95%, Bounce ≤ 30%
- 🟡 **Good**: Success ≥ 90%, Bounce ≤ 50%
- 🔴 **Poor**: Success < 90% or Bounce > 50%

## 🔍 Google Analytics Verification

The test captures all GA events by intercepting:

```javascript
// DataLayer pushes (GTM)
window.dataLayer.push(...)

// GA4 events
gtag('event', 'page_view', {...})

// Universal Analytics
ga('send', 'pageview')
```

All events are logged with timestamps and can be verified against actual GA dashboards.

## 🔧 Troubleshooting

### High Bounce Rate
- Check homepage load time
- Verify navigation links work
- Review error logs

### Low GA Event Count
- Verify GA/GTM is installed on pages
- Check browser console for errors
- Review GA property settings

### Session Failures
- Check target host availability
- Review Playwright traces in artifacts
- Verify network connectivity

### Slow Performance
- Reduce concurrent sessions
- Decrease session depth
- Check server capacity

## 📦 Artifacts

GitHub Actions uploads:
- **Navigation results** (30 days retention)
- **Session traces** (7 days retention)
- **Aggregated reports** (90 days retention)
- **Screenshots** (30 days retention)

## 🎨 Funnel Visualization

The HTML reports include:
- **Funnel completion bars** with percentages
- **Host comparison cards** for each funnel
- **Drop-off analysis** showing abandonment points
- **Time-to-completion** metrics
- **Color-coded performance** indicators

## 💡 Use Cases

### Marketing Analytics
- Verify GA tracking is working
- Test conversion funnels
- Measure user engagement
- Validate event tracking

### Performance Testing
- Test under realistic user behavior
- Measure page load with JavaScript execution
- Verify navigation performance
- Test CDN effectiveness

### Quality Assurance
- Verify all links work
- Test cross-page navigation
- Validate user journeys
- Check mobile responsiveness (configurable)

### A/B Testing Validation
- Compare funnel performance across hosts
- Verify consistent behavior
- Test deployment differences
- Validate CDN configurations

## 🔄 Continuous Monitoring

With scheduled runs every 8 hours:
- **Detect navigation issues** early
- **Monitor GA tracking** continuously
- **Track funnel performance** over time
- **Alert on degradation** via GitHub Actions

## 📊 Example Session Flow

```
Session #42 (Duration: 45s, Pages: 4)
├─ Homepage (/) - 1.2s load, 3 GA events
│  └─ Clicked: "How It Works" link
├─ How It Works (/how_it_works.html) - 0.8s load, 2 GA events
│  └─ Scrolled 60%, waited 3s
├─ Personal Loans (/personal_loans.html) - 1.1s load, 4 GA events
│  └─ Clicked: "FAQs" link
└─ FAQs (/faqs.html) - 0.9s load, 2 GA events

✅ Funnel Completed: "Homepage → How It Works → Personal Loans"
📊 Total GA Events: 11
```

## 🎯 Best Practices

1. **Run during off-peak hours** to avoid affecting real users
2. **Monitor GA dashboards** during tests to verify tracking
3. **Compare results across hosts** to identify issues
4. **Review traces** for failed sessions
5. **Adjust session depth** based on actual user behavior
6. **Use realistic concurrency** (50-100 sessions)
7. **Archive reports** for trend analysis

## 🚨 Important Notes

- Tests use real browsers and execute JavaScript
- GA events are actually fired (visible in GA dashboard)
- Tests generate real traffic (use test GA properties if needed)
- Concurrent sessions consume system resources
- Each session opens a new browser context
- Screenshots captured only on errors
- Traces help debug navigation issues

## 📝 License

ISC

## 🤝 Contributing

Modify funnels in `ga-navigation-test.js`:

```javascript
const funnels = {
  'Your Custom Funnel': ['/page1.html', '/page2.html', '/page3.html']
};
```

Add new pages to the endpoints array with appropriate weights.
