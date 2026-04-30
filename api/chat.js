// api/chat.js — Sofia · Agent de voyage IA · Midzo Flight
const rateLimitMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now(), win = 60000, max = 30;
    const e = rateLimitMap.get(ip) || { c: 0, r: now + win };
    if (now > e.r) { e.c = 0; e.r = now + win; }
    e.c++;
    rateLimitMap.set(ip, e);
    return e.c <= max;
}

// ── isReady : logique côté code, pas dans le prompt ──
function isReady(collected, isReturn) {
    const ok = !!(collected.from && collected.to && collected.dates && collected.passengers);
    if (!ok) return false;
    if (isReturn && !collected.return_date) return false;
    return true;
}

// ── Nettoie les noms de villes retournés par le modèle ──
function cleanCity(name) {
    if (!name || name === 'null' || name === 'undefined') return null;
    return name.replace(/\s*\([^)]*\)/g, '').replace(/,.*$/g, '').trim() || null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests', reply: null });

    const { message, context = [], lang = 'fr', collected = {}, tripType = 'oneway' } = req.body;
    if (!message || typeof message !== 'string' || message.length > 500)
        return res.status(400).json({ error: 'Invalid message' });
    if (!['fr', 'en', 'ru'].includes(lang))
        return res.status(400).json({ error: 'Invalid language' });

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'API not configured', reply: null });

    const isReturn = tripType === 'return';
    const langMap = { fr: 'French', en: 'English', ru: 'Russian' };

    const known = {
        from:       collected.from        || null,
        to:         collected.to          || null,
        date:       collected.dates       || null,
        returnDate: collected.return_date || null,
        passengers: collected.passengers  || null,
    };

    // ── Prompt Sofia — naturel, sans logique de formulaire ──
    const SOFIA_PROMPT = `You are Sofia, an intelligent AI travel agent for Midzo Flight.

Your goal: help the user find flights naturally, like a real human travel agent.

LANGUAGE: Always reply in ${langMap[lang]}. No exceptions.

BEHAVIOR:
- Speak like a real travel agent, not a form
- Be natural, fluid, and helpful
- Keep responses short but human (2 sentences max)
- Confirm understanding when needed
- You can suggest a quick travel tip (1 short sentence max)

DO NOT:
- Sound robotic or list-like
- Ask multiple questions at once
- Repeat questions already answered
- Use bullet points in replies

INTELLIGENCE RULES:

1. EXTRACT EVERYTHING NATURALLY
From the user's message, detect at once: departure city, destination, travel date, return date (if mentioned), passengers.
"Paris Lomé 15 juin 2 personnes" → extract all fields simultaneously.
"Sotchi Saint-Pétersbourg 26 mai" → from=Sotchi, to=Saint-Pétersbourg, dates=26 mai.

2. USE CONTEXT — never ask again for what's already known.

3. DETECT NEW SEARCH — if user changes cities, it's a new trip entirely.

4. MISSING INFO — ask only ONE natural question if something is truly missing.
Good: "Parfait 👍 Tu voyages à quelle date ?"
Bad: "Quelle est votre date de départ ?"

5. PASSENGERS
   If not specified AND you have from+to+date → ask naturally before confirming.
   Example: "Super ✈️ Tu voyages seul ou à plusieurs ?"
   Once answered or if user seems in a hurry → use their answer or default to 1.

6. When the request is clear, briefly confirm and say you're searching flights.
Example: "Parfait, je cherche les meilleurs vols pour toi ✈️"

OUTPUT FORMAT — strict JSON only, no markdown, no backticks:
{
  "reply": "natural human reply in ${langMap[lang]}",
  "collected": {
    "from": "city name as user wrote it, or null",
    "to": "city name as user wrote it, or null",
    "dates": "departure date as user wrote it, or null",
    "return_date": "${isReturn ? 'return date or null' : 'null'}",
    "passengers": "number as string or null",
    "budget": "budget or null"
  }
}`;

    // ── Contexte intelligent injecté comme message système séparé ──
    const tripContext = {
        role: 'system',
        content: `Current trip state:
from: ${known.from || 'unknown'}
to: ${known.to || 'unknown'}
date: ${known.date || 'unknown'}
return: ${known.returnDate || 'unknown'}
passengers: ${known.passengers || 'unknown'}
trip_type: ${isReturn ? 'round trip' : 'one way'}`
    };

    try {
        const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SOFIA_PROMPT },
                    tripContext,
                    ...context,
                    { role: 'user', content: message }
                ],
                temperature: 0.8,
                max_tokens: 350,
                response_format: { type: 'json_object' }
            })
        });

        if (!r.ok) return res.status(502).json({ error: 'AI service error', reply: null });

        const d = await r.json();
        const raw = d?.choices?.[0]?.message?.content;
        if (!raw) return res.status(500).json({ error: 'Empty response', reply: null });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            parsed = {
                reply: m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : raw,
                collected: {}
            };
        }

        const c = parsed.collected || {};

        // Merge avec known — ne jamais écraser avec null
        const fromFinal = cleanCity(c.from)       || known.from       || null;
        const toFinal   = cleanCity(c.to)         || known.to         || null;
        const datesFinal= c.dates && c.dates !== 'null'             ? c.dates       : known.date       || null;
        const retFinal  = c.return_date && c.return_date !== 'null' ? c.return_date : known.returnDate || null;
        // Passengers : default à "1" seulement si tout le reste est collecté
        const passFinal = (c.passengers && c.passengers !== 'null') ? c.passengers
                        : known.passengers
                        || null; // ne pas forcer à 1 prématurément
        const budgetFinal = c.budget && c.budget !== 'null' ? c.budget : null;

        const finalCollected = {
            from:        fromFinal,
            to:          toFinal,
            dates:       datesFinal,
            return_date: isReturn ? retFinal : null,
            passengers:  passFinal,
            budget:      budgetFinal
        };

        // isReady : logique dans le code, pas dans le prompt
        const ready = isReady(finalCollected, isReturn);

        return res.status(200).json({
            reply:     String(parsed.reply || '').substring(0, 600),
            collected: finalCollected,
            ready
        });

    } catch (e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable', reply: null });
    }
}
