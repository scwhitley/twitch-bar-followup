// index.js — Discord adapter worker (ESM)

// 1) Env + safety
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ActivityType,
  Options,
} from 'discord.js';

const {
  DISCORD_TOKEN,
  GUILD_ID,
  PREFIX = '!',
  BACKEND_URL,            // e.g. https://your-backend.onrender.com/discord
  BACKEND_SECRET,         // must match backend
  PROMO_CHANNEL_ID = '',
} = process.env;

console.log('[BOOT]', {
  hasToken: !!DISCORD_TOKEN,
  tokenLen: (DISCORD_TOKEN || '').length,
  guildId: GUILD_ID,
  backend: BACKEND_URL,
});

process.on('unhandledRejection', (r) => console.error('UNHANDLED REJECTION:', r));
process.on('uncaughtException', (e) => console.error('UNCAUGHT EXCEPTION:', e));

// 2) Discord client (lean caches so 512MB plans are comfy)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // needed to assign roles
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // needed for prefix commands
  ],
  partials: [Partials.Channel],
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    GuildMemberManager: 200,
  }),
  sweepers: {
    messages: { interval: 300, lifetime: 600 },
  },
});

client.on('error', (e) => console.error('[CLIENT ERROR]', e));
client.on('shardError', (e) => console.error('[SHARD ERROR]', e));
// Uncomment if you need noisy gateway debugging:
// client.on('debug', (m) => { if (!String(m).includes('Heartbeat')) console.log('[DEBUG]', m); });

// 3) Role ladder (every 10 drinks)
const ROLE_LADDER = [
  'Bar Newbie',
  'Spirited Initiate',
  'Distorted Drunkard',
  'Crimson Sipper',
  'Alchemical Tester',
  'Elixer Connoisseur',
  'Libation Enthusiast',
  'Realm Regular',
  'Celestial Concoctionist',
  'Likka Master',
];
const tierFor = (lifetime) => Math.min(Math.floor(lifetime / 10), ROLE_LADDER.length - 1);

// 4) Tiny HTTP helpers to reach your backend
async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${BACKEND_SECRET}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BACKEND_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

// 5) Menu cache (optional, hot-loaded on boot)
let DRINKS = [];
let DRINK_KEYS = new Set();
async function refreshMenu() {
  const data = await apiGet('/menu'); // backend returns { drinks: [...] }
  DRINKS = data.drinks || [];
  DRINK_KEYS = new Set(DRINKS.map(d => d.key.toLowerCase()));
}

// 6) Promotions
async function assignRoleIfNeeded(member, lifetime) {
  const targetIdx = tierFor(lifetime);
  const targetName = ROLE_LADDER[targetIdx];

  const guild = member.guild;
  await guild.roles.fetch().catch(() => {});
  const byName = new Map(guild.roles.cache.map(r => [r.name, r]));
  const target = byName.get(targetName);
  if (!target) return { changed: false, role: null };

  const ladderNames = new Set(ROLE_LADDER);
  const current = member.roles.cache.filter(r => ladderNames.has(r.name));
  const hasTarget = current.some(r => r.id === target.id);
  if (hasTarget && current.size === 1) return { changed: false, role: target };

  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    console.warn('[WARN] Missing Manage Roles permission.');
    return { changed: false, role: null };
  }

  try {
    const toRemove = current.filter(r => r.id !== target.id);
    if (toRemove.size) await member.roles.remove(toRemove);
    if (!hasTarget) await member.roles.add(target);
    return { changed: true, role: target };
  } catch (e) {
    console.warn('[WARN] Role change failed:', e?.message || e);
    return { changed: false, role: null };
  }
}

// 7) Command router
client.on('messageCreate', async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.guild || msg.guild.id !== GUILD_ID) return;

    const content = msg.content?.trim() || '';
    if (!content.startsWith(PREFIX)) return;

    const [cmdWordRaw] = content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = (cmdWordRaw || '').toLowerCase();

    // menu
    if (cmd === 'menu') {
      if (DRINKS.length === 0) await refreshMenu().catch(() => {});
      const lines = DRINKS.map(d => `\`${PREFIX}${d.key}\` — **${d.name}** (${d.price} DD)`);
      await msg.reply(lines.length ? `**The Stirred Veil Menu**\n${lines.join('\n')}` : 'Menu is empty 🤔');
      return;
    }

    // balance
    if (cmd === 'balance') {
      const data = await apiGet(`/balance?platform=discord&userId=${msg.author.id}`);
      await msg.reply(`${msg.author}, your balance is **${data.balance} DD**, lifetime drinks: **${data.lifetimeDrinks}**.`);
      return;
    }

    // admin: optionally allow !reloadmenu (Manage Server)
    if (cmd === 'reloadmenu') {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        await msg.reply('Manage Server required.');
        return;
      }
      await refreshMenu();
      await msg.reply('Menu reloaded from backend.');
      return;
    }

    // otherwise treat as drink command — let backend validate
    const result = await apiPost('/purchase', {
      platform: 'discord',
      userId: msg.author.id,
      command: cmd,
    });

    if (!result.ok) {
      await msg.reply(result.error || 'Purchase failed.');
      return;
    }

    // Print backend-crafted message (already includes price/desc/quip/balances)
    await msg.reply(result.message);

    // Role bump on each 10 drinks
    if (typeof result.lifetimeDrinks === 'number') {
      const beforeTier = tierFor((result.lifetimeDrinks || 0) - 1);
      const afterTier = tierFor(result.lifetimeDrinks);
      if (afterTier > beforeTier) {
        const member = await msg.guild.members.fetch(msg.author.id);
        const { changed, role } = await assignRoleIfNeeded(member, result.lifetimeDrinks);
        if (changed && role) {
          const promoChannel = PROMO_CHANNEL_ID
            ? await msg.guild.channels.fetch(PROMO_CHANNEL_ID).catch(() => null)
            : null;
          const target = promoChannel || msg.channel;
          await target.send(`${msg.author} leveled up to **${role.name}**. The bottles whispered your name.`);
        }
      }
    }
  } catch (err) {
    console.error('messageCreate error:', err);
    try { await msg.reply('Something spilled behind the bar. Try again in a sec.'); } catch {}
  }
});

// 8) Ready
client.once('clientReady', async () => {
  try {
    console.log('[READY] Logged in as', client.user?.tag);
    await refreshMenu().catch(() => {});
    client.user.setPresence({
      activities: [{ name: `${PREFIX}menu in The Stirred Veil`, type: ActivityType.Listening }],
      status: 'online',
    });
  } catch (e) {
    console.error('[READY ERROR]', e);
  }
});

// 9) Login
client.login(DISCORD_TOKEN).catch(e => console.error('[LOGIN ERROR]', e));

