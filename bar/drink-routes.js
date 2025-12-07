
// ------------ Imports -------------
import { QUIPS } from "./data/drink-quips.js";


const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
const line = `@${to} has received a ${drinkName} from @${from}! ${quip}`;
