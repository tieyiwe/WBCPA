// ─────────────────────────────────────────────────────────────────────────────
// WBCPA Command Center — Express entrypoint
// Boots cleanly with zero env vars set. All external integrations degrade
// gracefully to mock data.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const subscribersRoutes = require('./routes/subscribers');
const voiceRoutes = require('./routes/voice');
const calendarRoutes = require('./routes/calendar');
const emailsRoutes = require('./routes/emails');
const clientsRoutes = require('./routes/clients');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const escalationsRoutes = require('./routes/escalations');
const taxDocsRoutes = require('./routes/taxDocs');
const miltonRoutes = require('./routes/milton');

const { deployAgent } = require('./services/superAgentService');
const { sendDeadlineReminders } = require('./services/reminderService');
const { processInboxEmails } = require('./services/emailService');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
}

// ─── API routes ──────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subscribers', subscribersRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/escalations', escalationsRoutes);
app.use('/api/taxdocs', taxDocsRoutes);
app.use('/api/milton', miltonRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'WBCPA Command Center' });
});

// ─── Static client ───────────────────────────────────────────────────────────

const DIST_DIR = path.resolve(__dirname, '../client/dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const REPO_ROOT = path.resolve(__dirname, '..');

function ensureClientBuilt() {
  if (fs.existsSync(INDEX_HTML)) return true;
  console.log('[Boot] client/dist not found — running `vite build` now…');
  try {
    const viteBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'vite');
    const cmd = fs.existsSync(viteBin) ? `"${viteBin}" build` : 'npx --yes vite build';
    execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
    return fs.existsSync(INDEX_HTML);
  } catch (err) {
    console.warn('[Boot] Vite build failed:', err.message);
    return false;
  }
}

ensureClientBuilt();

if (fs.existsSync(INDEX_HTML)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(INDEX_HTML);
  });
} else {
  // If the build genuinely cannot run, surface a helpful page instead of crashing.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.status(200).send(`
      <!doctype html>
      <html>
        <head><title>WBCPA Command Center</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; background: #0a0d14; color: #e8e8e8; padding: 48px; }
            code { background: #141928; padding: 4px 8px; border-radius: 4px; color: #c9a84c; }
            a { color: #c9a84c; }
          </style>
        </head>
        <body>
          <h1 style="color:#c9a84c">WBCPA Command Center — API is running</h1>
          <p>The React dashboard couldn't be built automatically. From the Replit shell, run:</p>
          <p><code>npm install && npm run build</code></p>
          <p>Then reload this page.</p>
          <p>API health: <a href="/health">/health</a></p>
        </body>
      </html>
    `);
  });
}

// ─── Global error handler ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Express]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

// ─── CRON jobs ───────────────────────────────────────────────────────────────

function registerCronJobs() {
  // Refresh Bland prompt daily at 6AM (switches tone with season)
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Redeploying voice agent with current season tone...');
    try {
      await deployAgent();
    } catch (err) {
      console.warn('[CRON] deployAgent error:', err.message);
    }
  });

  // Daily deadline reminders at 9AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Running deadline reminder batch...');
    try {
      await sendDeadlineReminders();
    } catch (err) {
      console.warn('[CRON] sendDeadlineReminders error:', err.message);
    }
  });

  // Inbox scan every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processInboxEmails();
    } catch (err) {
      console.warn('[CRON] processInboxEmails error:', err.message);
    }
  });

  console.log('[CRON] Jobs registered (agent redeploy 06:00, deadline reminders 09:00, inbox scan every 5 min).');
}

// ─── Boot ────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, async () => {
  console.log(`\n┌─────────────────────────────────────────────────────┐`);
  console.log(`│  WBCPA Command Center — listening on ${HOST}:${PORT}   │`);
  console.log(`│  Built by TIblogics for WB CPA                      │`);
  console.log(`└─────────────────────────────────────────────────────┘\n`);

  registerCronJobs();

  try {
    const result = await deployAgent();
    if (result.ok) {
      console.log('[Boot] Voice agent deployed successfully.');
    } else if (result.mock) {
      console.log('[Boot] Voice agent in MOCK_MODE (BLAND_API_KEY not set).');
    }
  } catch (err) {
    console.warn('[Boot] deployAgent failed:', err.message);
  }
});
