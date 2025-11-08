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
