// discord.routes.js (ESM)
import { Router } from 'express';
import { getMenu, getBalance, purchaseDrink } from './discordEconomy.js';

const router = Router();

// Bearer auth for all /discord routes
function requireBearer(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!process.env.BACKEND_SECRET || token !== process.env.BACKEND_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

router.use(requireBearer);

// Small liveness endpoint (auth required so randos can’t scrape)
router.get('/_alive', (_req, res) => res.json({ ok: true }));

// Menu
router.get('/menu', async (_req, res) => {
  const drinks = await getMenu();
  console.log('[BACKEND] /discord/menu ->', drinks.length, 'items');
  res.json({ drinks });
});

// Balance
router.get('/balance', async (req, res) => {
  const { platform = 'discord', userId } = req.query;
  if (!userId) return res.status(400).json({ ok: false, error: 'Missing userId' });
  const data = await getBalance({ platform, userId });
  res.json(data);
});

// Purchase
router.post('/purchase', async (req, res) => {
  const { platform = 'discord', userId, command } = req.body || {};
  if (!userId || !command) return res.status(400).json({ ok: false, error: 'Missing userId or command' });
  const result = await purchaseDrink({ platform, userId, command: String(command).toLowerCase() });
  res.json(result);
});

export default router;
