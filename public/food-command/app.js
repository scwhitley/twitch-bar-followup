// Sith-y food chooser overlay
// Works as: (a) StreamElements Custom Widget (listens to !plate) OR (b) plain OBS Browser Source + server trigger.

const state = {
  running: false,
  config: {
    fadeInMs: 300,
    fadeOutMs: 400,
    mainShuffleMs: 2500,
    sideDelayMs: 400,       // side starts this long after main
    endPauseMs: 1000,       // wait after sound before hiding
    pollMs: 3000            // server trigger poll
  },
  mains: [
    "Fried Chicken", "Garlic Rosemary Ribeye Steak", "Stuffed Pork Chops", "Balsamic Lamb Chops", "Spicy Seared Ahi Tuna",
    "Oxtail with Extra Gravy", "Jerk Chicken", "Jerk Pork", "Shrimp Fettuccini Alfredo", "Cajun Rigatoni Penne Pasta"
  ],
  sides: [
    "Melanated Macaroni and Cheese", "Garlic Butter Asparagus", "Rice", "Fried Cabbage",
    "Loaded Mashed Potatoes", "Lemon Pepper Broccoli", "Crippling Depression", "Candied Yams"
  ],
  lastTriggerTs: 0
};

const overlayEl = document.getElementById("overlay");
const slotMain = document.getElementById("slot-main");
const slotSide = document.getElementById("slot-side");
const sfx = document.getElementById("confirm-audio");

// Attempt to load remote menu JSON (optional)
(async function loadMenu() {
  try {
    const res = await fetch("./data/menu.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.mains) && data.mains.length) state.mains = data.mains;
      if (Array.isArray(data.sides) && data.sides.length) state.sides = data.sides;
    }
  } catch {}
})();

// Helper: random pick
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Run the full animation
async function runSequence(source = "unknown") {
  if (state.running) return;
  state.running = true;

  // Fade in
  overlayEl.classList.remove("hidden");
  await wait(state.config.fadeInMs);

  // Start shuffles
  slotMain.textContent = "—";
  slotSide.textContent = "—";

  const start = Date.now();
  const mainInterval = setInterval(() => { slotMain.textContent = pick(state.mains); }, 50);

  // Side starts a beat later
  await wait(state.config.sideDelayMs);
  const sideInterval = setInterval(() => { slotSide.textContent = pick(state.sides); }, 50);

  // Stop main after mainShuffleMs
  await waitUntil(() => Date.now() - start >= state.config.mainShuffleMs);
  clearInterval(mainInterval);
  slotMain.textContent = pick(state.mains);

  // Stop side a moment after main (keeps it dramatic)
  await wait(350);
  clearInterval(sideInterval);
  slotSide.textContent = pick(state.sides);

  // Play confirm SFX once both are locked
  try { sfx.currentTime = 0; await sfx.play(); } catch {}

  // Wait, then fade out & hide
  await wait(state.config.endPauseMs);
  overlayEl.classList.add("fade-out");
  await wait(state.config.fadeOutMs);
  overlayEl.classList.remove("fade-out");
  overlayEl.classList.add("hidden");

  state.running = false;
}

// Utilities
function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
function waitUntil(fn, step=50){ return new Promise(async r => { while(!fn()) await wait(step); r(); }); }

// ----- StreamElements hooks (if this is imported as a SE Custom Widget) -----
function isSE() {
  return typeof window.onEventReceived !== "undefined" || typeof SE_API !== "undefined";
}

// Shim the SE lifecycle so we can attach listeners in both environments
window.onWidgetLoad = (obj) => {
  // nothing needed here yet, but SE calls this on load
};

window.onEventReceived = (obj) => {
  try {
    // message events look like: { detail: { listener: 'message', event: { data: { text: '...'}}}}
    const d = obj?.detail;
    if (d?.listener !== "message") return;
    const text = (d?.event?.data?.text || "").trim().toLowerCase();

    // your command: !plate
    if (text.startsWith("!plate")) {
      runSequence("streamelements");
    }
  } catch {}
};

// ----- Server trigger polling (for OBS Browser Source or backend-driven runs) -----
const serverBase = (() => {
  // If hosted on your Render domain, relative works; else allow ?serverBase= override
  const u = new URL(window.location.href);
  const base = u.searchParams.get("serverBase");
  return base || ""; // '' => same origin
})();

async function pollTrigger() {
  try {
    const res = await fetch(`${serverBase}/api/food-command/next?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    if (json?.trigger) {
      runSequence("server");
    }
  } catch {}
}

setInterval(pollTrigger, state.config.pollMs);

// ----- Manual trigger for testing -----
window.FOOD = {
  trigger: () => runSequence("manual")
};
console.log("[food-command] ready. Type FOOD.trigger() in the console to test.");

