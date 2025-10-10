
// discord.routes.js (CommonJS)
const { Router } = require('express');
const { getMenu, getBalance, purchaseDrink } = require('./discordEconomy');

const router = Router();

function requireBearer(req,res,next){
  const header=req.headers.authorization||''; const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!process.env.BACKEND_SECRET || token!==process.env.BACKEND_SECRET) return res.status(401).json({ ok:false, error:'Unauthorized' });
  next();
}

router.use(requireBearer);

router.get('/menu', async (_req,res)=> {
  const drinks = await getMenu();
  console.log('[BACKEND] /discord/menu ->', drinks.length, 'items');
  res.json({ drinks });
});

router.get('/balance', async (req,res)=> {
  const { platform='discord', userId } = req.query;
  if(!userId) return res.status(400).json({ ok:false, error:'Missing userId' });
  const data = await getBalance({ platform, userId });
  res.json(data);
});

router.post('/purchase', async (req,res)=> {
  const { platform='discord', userId, command } = req.body || {};
  if(!userId || !command) return res.status(400).json({ ok:false, error:'Missing userId or command' });
  const result = await purchaseDrink({ platform, userId, command:String(command).toLowerCase() });
  res.json(result);
});

module.exports = router;
