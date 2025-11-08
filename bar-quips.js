// bar-quips.js — all chat lines live here

// ---- Bar follow-up quips ----
export const LINES = [
  "Careful, that one's potent.",
  "Tip jar’s over there 👉 https://streamelements.com/d4rth_distortion/tip",
  "Another round already?",
  "I like the way you use that straw 😏",
  "This one’s made with love 😘",
  "Wish I could drink with you...",
  "This full glass is opposite of my empty life...",
  "You about to get cut off buddy!",
  "Ay lil shawty, can I have your number?",
  "We didn't have the liquor you wanted, so I substituted it with Everclear. It's all the same.",
  "Hell yeah I suck toes! *puts phone down* my bad, here’s your drink.",
  "Enjoy!",
  "*looks you up and down* that’s the outfit you chose tonight? *shrugs* couldn’t be me?",
  "Don’t spill it on the carpet.",
  "Here’s your drink, now get out my face.",
];

// ---- Complaint replies ----
export const COMPLAINTS = [
  (user, issue) => `Bartender to ${user}: “Oh, ${issue || "that drink"} not to your liking? Fine, but the jukebox still takes quarters.”`,
  (user, issue) => `Bartender to ${user}: “Not enough umbrella in your ${issue || "cocktail"}? We ran out after the last pirate convention.”`,
  (user, issue) => `Bartender to ${user}: “That ${issue || "drink"} comes with a free life lesson: don’t trust the specials board.”`,
  (user, issue) => `Bartender to ${user}: “Complain all you want, but my pour was measured by the gods themselves.”`,
  (user, issue) => `Bartender to ${user}: “Listen I literally don't get paid enough to deal. Take it up with D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “*crashes out* I DONT GIVE A DAMN ABOUT YOU OR THAT DRINK! FOH!”`,
  (user, issue) => `Bartender to ${user}: “Ah yes, ${issue || "your drink"}… we call that ‘house flavor’. It’s rustic.”`,
  (user, issue) => `Bartender to ${user}: “No refunds, but I’ll throw in an extra olive. That’s our version of customer service.”`,
  (user, issue) => `Bartender to ${user}: “If you wanted perfection, you should’ve gone to Hogwarts, not my bar.”`,
  (user, issue) => `Bartender to ${user}: “OMG I'm so sorry! Heres a new drink for you, please don't tell D4rth Distortion.”`,
  (user, issue) => `Bartender to ${user}: “Alright ${user}, I’ll remake it… but this time I’m charging you emotional labor.”`,
];

// ---- Bartender rage-quit lines ----
export const STORM_OFF = [
  (user) => `The bartender glares at ${user}, rips off the apron, and storms out screaming “Y’all don’t deserve me!”`,
  (user) => `Bartender yeets the bar rag, mutters something unholy about ${user}, and moonwalks out the door.`,
  (user) => `“I’m unionized with the Sith now,” the bartender hisses at ${user} before force-sliding out.`,
  (user) => `The bartender flips a coaster at ${user} like a ninja star and vanishes into the night.`,
  (user) => `Keys slam. “I quit this pixel bar,” they snarl at ${user}, exiting stage left in dramatic fashion.`,
  (user) => `Bartender burst into teers. “Now my pet giraffe won't have any oranges to eat! ,” they give sad puppy eyes at ${user}, and skidaddles out of the bar.`,
  (user) => `They snicker. “Me? Fired? You know you done fucked up right? Huh? Thats cool, I"m finna get the toolie and air dis bitch out, hold tight.” they do the gun fingers at ${user}, and bop out the back door.`,
];

// ---- Cheers lines ----
export const CHEERS = [
  (user) => `Bartender to ${user}: “Appreciate you! May your ice always clink and your Wi-Fi never drop.”`,
  (user) => `Bartender to ${user}: “Cheers, legend. Next one comes with extra style points.”`,
  (user) => `Bartender to ${user}: “Verified: you have excellent taste and impeccable vibes.”`,
  (user) => `Bartender to ${user}: “Gratitude noted. Hydration and happiness incoming.”`,
  (user) => `Bartender to ${user}: “Thanks fam. Tip jar smiles upon you.”`,
  (user) => `Bartender to ${user}: “Can you tell D4rth Distortion I got a good review?”`,
  (user) => `Bartender to ${user}: “Gee wilikers pal thank you very much! That was a splendifurous thing to say! Neato dude!”`,
];

// ---- “Grass entrepreneur” buy quips + rollup effects ----
export const WEED_QUIPS = [
  (u,p) => `“Keep it discreet, ${u}. ${p} pairs with lo-fi beats and good vibes.”`,
  (u,p) => `“Shadow vendor nods. ${p} acquired; snacks recommended.”`,
  (u,p) => `“Receipt printed in Sith ink. ${p} secured.”`,
  (u,p) => `“Be wise, ${u}. ${p} respects responsible chill.”`,
  (u,p) => `“Stocked up. ${p} unlocks +2 Vibes.”`,
];

export const ROLLUP_EFFECTS = [
  "exhales a perfect ring and contemplates the galaxy.",
  "finds the overlay surprisingly profound.",
  "initiates Operation: Snack Run.",
  "laughs at a silent meme for 12 seconds.",
  "nods to the beat like a sage.",
];

// ---- Gifted drink (senddrink) quips ----
export const GIFT_QUIPS = [
  (to, from) => `Bartender to @${to}: “Compliments of @${from}. If it starts smoking, that’s normal.”`,
  (to, from) => `A chilled glass slides to @${to}: “From @${from}. No refunds, only memories.”`,
  (to, from) => `Bartender to @${to}: “@${from} bought your silence… and a drink.”`,
  (to, from) => `A black-gloved hand delivers @${to} a drink. “Sender: @${from}.”`,
  (to, from) => `Bartender taps the counter: “On the house—courtesy of @${from}’s wallet.”`,
  (to, from) => `Bartender to @${to}: “Tribute from @${from}. May the Shroud flavor linger.”`,
  (to, from) => `A glass materializes before @${to}: “@${from} insists.”`,
  (to, from) => `Bartender to @${to}: “Gift incoming from @${from}. Side effects: swagger, mild menace.”`,
  (to, from) => `Bartender to @${to}: “@${from} paid in full. You pay with vibes.”`,
  (to, from) => `A nod from the bar. “@${from} thought you earned this, @${to}.”`,
];

// ---- Thanks responses (moods) ----
export const THANKS = {
  flirty: [
    (u,t)=>`@${u}: “Careful, @${t}—keep this up and I might start smiling.”`,
    (u,t)=>`@${u}: “Thanks @${t}. If this is a plot, I’m willing.”`,
    (u,t)=>`@${u}: “Cheers, @${t}. You pour like destiny.”`,
    (u,t)=>`@${u}: “Appreciate it, @${t}. Consider me… persuaded.”`,
  ],
  mean: [
    (u,t)=>`@${u}: “Thanks, @${t}. I’ll drink it—then plot later.”`,
    (u,t)=>`@${u}: “Gesture logged, @${t}. Affection on probation.”`,
    (u,t)=>`@${u}: “I owe you nothing, @${t}… but I’ll take the drink.”`,
    (u,t)=>`@${u}: “Next time, add fear. Thanks anyway, @${t}.”`,
  ],
  shy: [
    (u,t)=>`@${u}: “Oh—uh, thanks @${t}. That was… nice.”`,
    (u,t)=>`@${u}: “Thank you, @${t}. I’ll remember this.”`,
    (u,t)=>`@${u}: “Appreciated, @${t}. I’m not blushing—you’re blushing.”`,
    (u,t)=>`@${u}: “Thanks, @${t}. You didn’t have to…”`,
  ],
  standoffish: [
    (u,t)=>`@${u}: “Noted, @${t}. Kindness makes me suspicious.”`,
    (u,t)=>`@${u}: “Thanks, @${t}. I’ll repay you in unpredictability.”`,
    (u,t)=>`@${u}: “Debt acknowledged, @${t}. Collection is chaotic.”`,
    (u,t)=>`@${u}: “Gratitude logged. Walls remain up, @${t}.”`,
  ],
};
