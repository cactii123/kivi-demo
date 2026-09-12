/* =========================================================================
   KIVI ENGINE
   -------------------------------------------------------------------------
   This file is the whole point of the demo: it decides what Kivi remembers,
   when it trusts that memory enough to act on it, and when it should stop
   and ask instead. Everything here is deliberately readable and inspectable
   because the product's core claim ("Kivi never assumes what it doesn't
   know") has to be checkable in the code, not just in the pitch.

   Three memory capabilities exist. Nothing else does, on purpose:
     1. TIME + TOPIC RETRIEVAL over dictation history
        -> lets Hey Kivi find "the one from around 5pm yesterday"
     2. AUDIENCE TONE PROFILES ("manager" vs "the team" vs a named person)
        -> learned only from explicit correction or repeated confirmation
     3. GLOSSARY (proper nouns / project names / domain terms)
        -> learned only after a term is corrected more than once

   Dictation mode never calls into memory to change what's shown to the
   user. It only ever *deposits* low-trust candidate signals. Hey Kivi is
   the only mode allowed to retrieve memory, apply it, or write confirmed
   memory. That boundary is enforced structurally: dictation.js-side code
   calls extractCandidateSignals() and nothing else in this file; only the
   Hey Kivi handler calls retrieve/resolve/polish/learn.
   ========================================================================= */

const KiviEngine = (() => {
  const MEM_KEY = "kivi.memory.v2";
  const DECISIONS_KEY = "kivi.decisions.v1";
  const STOPWORDS = new Set(
    "the a an is are was were do does did to for of on in at from with and or but if my me i you your it this that around about yesterday today tomorrow morning afternoon evening night find get pull up polish clean tidy ready meeting into walking im i'm going".split(" ")
  );
  const FILLERS = ["um", "uh", "like", "you know", "actually", "basically", "sort of", "kind of"];
  const CONFIDENCE_MARGIN = 0.16; // if top-2 retrieval scores are closer than this, ask instead of guessing

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // ---- persistence -------------------------------------------------------
  function loadMemory() {
    try {
      return JSON.parse(localStorage.getItem(MEM_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveMemory(mem) {
    localStorage.setItem(MEM_KEY, JSON.stringify(mem));
  }
  function loadDecisions() {
    try {
      return JSON.parse(localStorage.getItem(DECISIONS_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveDecisions(d) {
    // cap history so localStorage doesn't grow unbounded in the demo
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(d.slice(-200)));
  }

  let memory = loadMemory();
  let decisions = loadDecisions();

  function recordDecision(rec) {
    rec.id = uid("dec");
    rec.ts = Date.now();
    decisions.push(rec);
    saveDecisions(decisions);
    return rec;
  }

  // ---- cost / latency simulation ------------------------------------------
  // Illustrative only — stands in for real ASR/LLM calls so the product's
  // "include latency, db growth, model usage, cost wherever they matter"
  // requirement is visible in the running demo, not just asserted in docs.
  function simStep(name, model, baseMs, jitterMs, costPer1kChars, chars) {
    const ms = Math.round(baseMs + Math.random() * jitterMs);
    const cost = model ? +(costPer1kChars * (chars / 1000)).toFixed(6) : 0;
    return { step: name, model: model || "-", ms, costUsd: cost };
  }

  // ---- entity / candidate-signal extraction (DICTATION MODE ONLY) --------
  // This is deliberately shallow. It never writes confirmed memory and it
  // never changes what's shown to the user in the dictate view — it only
  // deposits low-trust candidates for Hey Kivi to draw on later, and those
  // candidates are visible (not hidden) in the Memory view as "noticed,
  // not learned yet".
  function extractCandidateSignals(text) {
    const properNouns = Array.from(new Set((text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).filter(
      (w) => !STOPWORDS.has(w.toLowerCase()) && w.toLowerCase() !== "kivi"
    )));
    const keywords = Array.from(
      new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      )
    ).slice(0, 8);
    return { properNouns, keywords };
  }

  // ---- intent parsing ------------------------------------------------------
  function parseIntent(text) {
    const q = text.toLowerCase();
    const isFindAndPolish = /(find|pull up|get).*(polish|clean|tidy|ready)/.test(q) || (/polish/.test(q) && /(dictat|take|note)/.test(q));
    const isToneFeedback = /(more formal|less formal|too casual|too stiff|make it casual|keep it professional|too formal|more casual)/.test(q);
    const isRecallQuestion = /(what|when|who).*(second|last|first|yesterday|earlier)/.test(q) && !isFindAndPolish;

    if (isToneFeedback) return { type: "tone_feedback", raw: text };
    if (isFindAndPolish) return { type: "find_and_polish", raw: text };
    if (isRecallQuestion) return { type: "recall", raw: text };
    return { type: "chit_chat", raw: text };
  }

  // ---- time window resolution -----------------------------------------------
  function resolveTimeWindow(text, now = new Date()) {
    const q = text.toLowerCase();
    let dayOffset = 0;
    if (/yesterday/.test(q)) dayOffset = -1;
    else if (/today/.test(q)) dayOffset = 0;

    const hourMatch = q.match(/(\d{1,2})\s*(am|pm)/);
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);

    if (hourMatch) {
      let h = parseInt(hourMatch[1], 10);
      const mer = hourMatch[2];
      if (mer === "pm" && h !== 12) h += 12;
      if (mer === "am" && h === 12) h = 0;
      base.setHours(h, 0, 0, 0);
      return { center: base.getTime(), spanMs: 90 * 60 * 1000, label: `around ${hourMatch[1]}${mer} ${dayOffset === -1 ? "yesterday" : "today"}` };
    }
    if (/morning/.test(q)) { base.setHours(9, 0, 0, 0); return { center: base.getTime(), spanMs: 3 * 3600 * 1000, label: `${dayOffset === -1 ? "yesterday" : "today"} morning` }; }
    if (/afternoon/.test(q)) { base.setHours(15, 0, 0, 0); return { center: base.getTime(), spanMs: 3 * 3600 * 1000, label: `${dayOffset === -1 ? "yesterday" : "today"} afternoon` }; }
    if (/evening|night/.test(q)) { base.setHours(20, 0, 0, 0); return { center: base.getTime(), spanMs: 3 * 3600 * 1000, label: `${dayOffset === -1 ? "yesterday" : "today"} evening` }; }
    // no time reference given — whole day, wide span, low confidence by design
    base.setHours(12, 0, 0, 0);
    return { center: base.getTime(), spanMs: 12 * 3600 * 1000, label: dayOffset === -1 ? "yesterday" : "today", vague: true };
  }

  function topicHints(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  }

  // ---- retrieval -------------------------------------------------------------
  function retrieveCandidates(window, hints, takes) {
    return takes
      .map((t) => {
        const dt = Math.abs(t.createdAt - window.center);
        const timeScore = Math.max(0, 1 - dt / (window.spanMs * 1.5));
        const hay = (t.text + " " + (t.tags || []).join(" ")).toLowerCase();
        const hitHints = hints.filter((h) => hay.includes(h));
        const topicScore = hints.length ? hitHints.length / hints.length : 0;
        const score = window.vague ? topicScore : timeScore * 0.6 + topicScore * 0.4;
        const reasons = [];
        if (timeScore > 0.4) reasons.push(`close to ${window.label}`);
        if (hitHints.length) reasons.push(`mentions "${hitHints.join(", ")}"`);
        return { take: t, score, reasons };
      })
      .filter((c) => c.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }

  // ---- audience / tone resolution ---------------------------------------------
  function audienceHintFrom(text) {
    const q = text.toLowerCase();
    const known = memory.filter((m) => m.type === "tone").map((m) => m.key.toLowerCase());
    for (const k of known) if (q.includes(k)) return k;
    const generic = ["manager", "team", "client", "standup", "the meeting", "customer", "founder", "investor"];
    for (const g of generic) if (q.includes(g)) return g;
    return null;
  }

  function toneProfileFor(key) {
    if (!key) return null;
    return memory.find((m) => m.type === "tone" && m.status === "confirmed" && m.key.toLowerCase() === key.toLowerCase()) || null;
  }

  function glossaryTerms() {
    return memory.filter((m) => m.type === "glossary" && m.status === "confirmed");
  }

  // ---- polishing (stands in for an LLM generation call) -----------------------
  function polish(rawText, toneProfile, glossary) {
    let out = rawText.trim();
    FILLERS.forEach((f) => {
      out = out.replace(new RegExp(`\\b${f}\\b[,]?`, "gi"), "").replace(/\s{2,}/g, " ");
    });
    glossary.forEach((g) => {
      (g.evidence || []).forEach((e) => {
        if (e.misheardAs) out = out.replace(new RegExp(e.misheardAs, "gi"), g.value);
      });
    });
    out = out.trim();
    out = out.charAt(0).toUpperCase() + out.slice(1);
    if (!/[.!?]$/.test(out)) out += ".";

    const formal = toneProfile ? toneProfile.value === "formal" : false;
    const casual = toneProfile ? toneProfile.value === "casual" : false;
    if (formal) {
      out = out
        .replace(/\bcan't\b/gi, "cannot")
        .replace(/\bwon't\b/gi, "will not")
        .replace(/\bdon't\b/gi, "do not")
        .replace(/\bgonna\b/gi, "going to")
        .replace(/!/g, ".");
      out = "For the meeting: " + out;
    } else if (casual) {
      out = "Quick note before we jump in — " + out;
    } else {
      out = "Here's the polished version: " + out;
    }
    return out;
  }

  // ---- learning (WRITE side — only Hey Kivi mode calls this) ------------------
  function learnToneFeedback(audienceKey, direction, sourceTakeId) {
    const existing = memory.find((m) => m.type === "tone" && m.key.toLowerCase() === audienceKey.toLowerCase());
    const evidence = { takeId: sourceTakeId || null, signal: "explicit correction", ts: Date.now() };
    if (existing) {
      existing.value = direction;
      existing.evidence.push(evidence);
      // confirm only once there are 2+ consistent signals — a single
      // correction is recorded but not yet trusted enough to act on silently
      const consistent = existing.evidence.length >= 2;
      existing.status = consistent ? "confirmed" : "candidate";
      existing.confidence = Math.min(0.95, 0.5 + existing.evidence.length * 0.2);
      existing.updatedAt = Date.now();
    } else {
      memory.push({
        id: uid("mem"),
        type: "tone",
        key: audienceKey,
        value: direction,
        status: "candidate",
        confidence: 0.5,
        evidence: [evidence],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    saveMemory(memory);
  }

  function teachGlossaryTerm(term, canonical, misheardAs) {
    // Explicit teaching from the Memory view is the strongest possible
    // signal, so it's confirmed immediately — the one deliberate exception
    // to "learn only from repeated signals."
    const existing = memory.find((m) => m.type === "glossary" && m.key.toLowerCase() === term.toLowerCase());
    const evidence = { signal: "explicit teach", ts: Date.now(), misheardAs: misheardAs || null };
    if (existing) {
      existing.value = canonical;
      existing.evidence.push(evidence);
      existing.updatedAt = Date.now();
    } else {
      memory.push({
        id: uid("mem"),
        type: "glossary",
        key: term,
        value: canonical,
        status: "confirmed",
        confidence: 0.95,
        evidence: [evidence],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    saveMemory(memory);
  }

  function deleteMemory(id) {
    memory = memory.filter((m) => m.id !== id);
    saveMemory(memory);
  }

  function getMemory() {
    return memory.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function getDecisions() {
    return decisions.slice().sort((a, b) => b.ts - a.ts);
  }

  function memoryStats() {
    const bytes = new Blob([JSON.stringify(memory)]).size;
    return {
      count: memory.length,
      confirmed: memory.filter((m) => m.status === "confirmed").length,
      candidates: memory.filter((m) => m.status === "candidate").length,
      bytes,
    };
  }

  // ---- main entry point for Hey Kivi -------------------------------------------
  function handleHeyKivi(text, { takes, now = new Date() } = {}) {
    const t0 = performance.now();
    const intent = parseIntent(text);
    const timeline = [];
    const reasoning = [];
    timeline.push(simStep("intent parse", "kivi-intent-v1 (local)", 15, 20, 0, text.length));

    if (intent.type === "tone_feedback") {
      const q = text.toLowerCase();
      const direction = /(more casual|too formal|too stiff)/.test(q) ? "casual" : "formal";
      // Prefer the audience named right here in the correction; only fall
      // back to "whoever the last polish was for" if this message doesn't
      // name one itself.
      const namedHere = audienceHintFrom(text);
      const lastDecisionWithAudience = decisions.slice().reverse().find((d) => d.audienceKey);
      const audienceKey = namedHere || (lastDecisionWithAudience ? lastDecisionWithAudience.audienceKey : "the meeting");
      learnToneFeedback(audienceKey, direction, lastDecisionWithAudience ? lastDecisionWithAudience.sourceTakeId : null);
      reasoning.push(`Read this as tone feedback for "${audienceKey}" (${direction}).`);
      reasoning.push(`Recorded the correction. It becomes a trusted default after it's consistent twice — this is correction #${memory.find((m) => m.type === "tone" && m.key === audienceKey).evidence.length}.`);
      const rec = recordDecision({
        query: text, mode: "hey-kivi", intent: intent.type, audienceKey,
        retrieved: [], memoryUsed: [{ key: audienceKey, value: direction }],
        clarification: null, reasoning, action: "learn_tone",
        latency: timeline, costUsd: timeline.reduce((s, x) => s + x.costUsd, 0),
      });
      return { reply: `Got it — I'll lean ${direction} for "${audienceKey}" next time.`, trace: rec };
    }

    if (intent.type === "find_and_polish") {
      const window = resolveTimeWindow(text, now);
      const hints = topicHints(text);
      timeline.push(simStep("memory retrieval", null, 8, 12, 0, 0));
      const candidates = retrieveCandidates(window, hints, takes || []);

      if (!candidates.length) {
        reasoning.push(`Looked for a dictation ${window.label}${hints.length ? ` mentioning ${hints.join(", ")}` : ""} — found nothing close enough to act on.`);
        const rec = recordDecision({ query: text, mode: "hey-kivi", intent: intent.type, retrieved: [], memoryUsed: [], clarification: null, reasoning, action: "no_match", latency: timeline, costUsd: timeline.reduce((s, x) => s + x.costUsd, 0) });
        return { reply: `I couldn't find anything ${window.label}${hints.length ? ` about ${hints.join(", ")}` : ""}. Want to tell me roughly what it was about, or a more exact time?`, trace: rec };
      }

      const top = candidates[0];
      const second = candidates[1];
      const ambiguous = window.vague || (second && top.score - second.score < CONFIDENCE_MARGIN);

      if (ambiguous) {
        reasoning.push(`Found ${candidates.length} plausible matches ${window.label} and the top two are too close to guess safely (${top.score.toFixed(2)} vs ${second ? second.score.toFixed(2) : "—"}).`);
        const rec = recordDecision({
          query: text, mode: "hey-kivi", intent: intent.type,
          retrieved: candidates.map((c) => ({ takeId: c.take.id, score: +c.score.toFixed(2), reasons: c.reasons })),
          memoryUsed: [], clarification: { question: "Which one did you mean?", options: candidates.map((c) => c.take.id) },
          reasoning, action: "ask_clarification",
          latency: timeline, costUsd: timeline.reduce((s, x) => s + x.costUsd, 0),
        });
        return {
          reply: `I found a few things ${window.label} — which one?`,
          clarifyOptions: candidates.map((c) => ({ id: c.take.id, label: `"${c.take.text.slice(0, 60)}${c.take.text.length > 60 ? "…" : ""}" (${new Date(c.take.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})` })),
          trace: rec,
        };
      }

      reasoning.push(`Matched the dictation from ${new Date(top.take.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — ${top.reasons.join(" and ") || "closest in time"}. Confidence ${(top.score).toFixed(2)}, clear of the next best match.`);
      return finishPolish(top.take, text, reasoning, timeline);
    }

    if (intent.type === "recall") {
      const ordered = (takes || []).slice().sort((a, b) => b.createdAt - a.createdAt);
      reasoning.push("Simple recall question — answered directly from dictation history, no memory write needed.");
      const second = ordered[1];
      const rec = recordDecision({ query: text, mode: "hey-kivi", intent: intent.type, retrieved: second ? [{ takeId: second.id }] : [], memoryUsed: [], clarification: null, reasoning, action: "recall", latency: timeline, costUsd: 0 });
      return { reply: second ? `That one was: "${second.text}"` : "There isn't a second one yet.", trace: rec };
    }

    reasoning.push("No task-shaped intent detected — replying conversationally without touching memory.");
    const rec = recordDecision({ query: text, mode: "hey-kivi", intent: intent.type, retrieved: [], memoryUsed: [], clarification: null, reasoning, action: "chit_chat", latency: timeline, costUsd: 0 });
    return { reply: "I'm here. Try something like: “find the dictation from around 5pm yesterday and polish it for the meeting.”", trace: rec };
  }

  function finishPolish(sourceTake, originalQuery, reasoning, timeline) {
    const audienceKey = audienceHintFrom(originalQuery) || "the meeting";
    const profile = toneProfileFor(audienceKey);
    const glossary = glossaryTerms();
    timeline.push(simStep("tone lookup", null, 5, 8, 0, 0));

    if (!profile) {
      reasoning.push(`No confirmed tone preference for "${audienceKey}" yet, so this uses a neutral default rather than guessing a style.`);
    } else {
      reasoning.push(`Applied the "${profile.value}" tone learned for "${audienceKey}" (${profile.evidence.length} confirming corrections).`);
    }
    if (glossary.length) reasoning.push(`Preserved ${glossary.length} learned term(s): ${glossary.map((g) => g.value).join(", ")}.`);

    timeline.push(simStep("polish generation", "kivi-polish-v1 (local sim)", 220, 260, 0.02, sourceTake.text.length));
    const output = polish(sourceTake.text, profile, glossary);

    const rec = recordDecision({
      query: originalQuery, mode: "hey-kivi", intent: "find_and_polish",
      audienceKey, sourceTakeId: sourceTake.id,
      retrieved: [{ takeId: sourceTake.id }],
      memoryUsed: profile ? [{ key: profile.key, value: profile.value }] : [],
      clarification: null, reasoning, action: "polish",
      latency: timeline, costUsd: timeline.reduce((s, x) => s + x.costUsd, 0),
      output,
    });
    return { reply: output, trace: rec, needsToneFeedbackPrompt: !profile, audienceKey };
  }

  function resumeWithChoice(takeId, originalQuery, takes) {
    const t = (takes || []).find((x) => x.id === takeId);
    if (!t) return { reply: "I lost track of that one — could you try again?" };
    const reasoning = [`You picked the dictation from ${new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} directly, so no further retrieval guessing was needed.`];
    return finishPolish(t, originalQuery, reasoning, []);
  }

  return {
    extractCandidateSignals,
    handleHeyKivi,
    resumeWithChoice,
    learnToneFeedback,
    teachGlossaryTerm,
    deleteMemory,
    getMemory,
    getDecisions,
    memoryStats,
  };
})();
