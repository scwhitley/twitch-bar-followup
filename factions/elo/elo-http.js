// /factions/elo/elo-http.js
import express from "express";
import { sanitizeOneLine } from "../core/faction-utils.js";
import { ensureElo } from "./elo-core.js";
import { getAlignment } from "../core/alignment-core.js";

export const eloRouter = express.Router();

eloRouter.get("/elo", async (req, res) => {
  try {
    const whoRaw =
      req.query.user || req.query.name || req.query.target || req.query.sender || "";
    const who = sanitizeOneLine(String(whoRaw)).replace(/^@+/, "").toLowerCase();
    if (!who) {
      return res.type("text/plain").send("Usage: /elo?user=NAME");
    }

    const [elo, align] = await Promise.all([ensureElo(who), getAlignment(who)]);
    const side = align ? align[0].toUpperCase() + align.slice(1) : "Unaligned";

    res
      .set("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .status(200)
      .send(`@${who} — ELO ${elo} (${side})`);
  } catch (err) {
    console.error("ELO endpoint error:", err);
    res.type("text/plain").status(500).send("ELO: unavailable right now.");
  }
});
