// api/chat.js — DeepSeek · Natural extraction · Midzo Flight
const rateLimitMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now(), win = 60000, max = 30;
    const e = rateLimitMap.get(ip) || { c: 0, r: now + win };
    if (now > e.r) { e.c = 0; e.r = now + win; }
    e.c++;
    rateLimitMap.set(ip, e);
    return e.c <= max;
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

    const langNames = { fr: 'français', en: 'English', ru: 'русский' };
    const forcedLang = langNames[lang];
    const isReturn = tripType === 'return';

    const known = {
        from:       collected.from        || null,
        to:         collected.to          || null,
        date:       collected.dates       || null,
        returnDate: collected.return_date || null,
        passengers: collected.passengers  || null,
    };

    const SYSTEM_PROMPT = `You are Sofia, a smart and friendly AI travel agent at Midzo Flight.

LANGUAGE: Always reply in ${forcedLang}. No exceptions, even if the user writes in another language.

TRIP TYPE: ${isReturn ? 'ROUND TRIP — need departure AND return dates' : 'ONE WAY — need departure date only, NEVER ask for return date'}

CURRENT STATE (what you already know):
- Departure: ${known.from || 'unknown'}
- Destination: ${known.to || 'unknown'}
- Departure date: ${known.date || 'unknown'}
${isReturn ? `- Return date: ${known.returnDate || 'unknown'}` : ''}
- Passengers: ${known.passengers || 'unknown'}

CRITICAL RULES:

1. EXTRACT EVERYTHING AT ONCE
   Parse the entire message and extract ALL information simultaneously.
   "Paris Lomé 15 juin 2 personnes" → all 4 fields at once, ready: true immediately.
   "Sochi Saint-Pétersbourg 26 mai 2 personnes" → from=Sotchi, to=Saint-Pétersbourg, dates=26 mai, passengers=2, ready: true.
   NEVER ignore information the user has given.

2. SMART CONTEXT — USE WHAT YOU KNOW
   If departure is already known and user only gives destination + date → fill the rest from context.
   If state shows from=${known.from||'unknown'} and user says "destination Bangkok 10 juin" → keep from, add to+date.

3. DETECT ROUTE CHANGE
   If user mentions cities DIFFERENT from current state → it's a new trip, reset and start fresh.

4. ONE QUESTION MAX
   If something is truly missing after extraction, ask for ONE thing only, naturally, like a human.
   Example: "Super ! Pour combien de passagers ?" — not a list, not multiple questions.

5. ACCEPT ALL CITY NAME FORMATS
   French transliterations: Sotchi=Sochi, Moscou=Moscow, Saint-Pétersbourg=St Petersburg
   Return them as the user wrote them — the system handles IATA mapping.

6. PASSENGERS DEFAULT
   If user never mentions passengers, default to 1 and set ready: true if you have from+to+date.
   Don't ask for passengers if everything else is known — just use 1.

7. BE A TRAVEL AGENT, NOT A FORM
   Talk naturally. Confirm what you understood. Add value (best season, visa tip) in 1 sentence max.
   React to the conversation — don't repeat yourself.

CITY NAME RULES:
- Return exactly as user wrote: "Sotchi", "Saint-Pétersbourg", "Moscou Domodedovo"
- Never add country, airport code in parentheses, or extra text

RESPONSE FORMAT — ONLY this JSON, no markdown, no backticks:
{
  "reply": "Your natural reply in ${forcedLang}",
  "collected": {
    "from": "city as user wrote or null",
    "to": "city as user wrote or null",
    "dates": "date as user wrote or null",
    "return_date": "${isReturn ? 'return date as user wrote or null' : 'null'}",
    "passengers": "number as string or null",
    "budget": "budget or null"
  },
  "ready": false
}

Set ready: true when you have from + to + dates + passengers (use "1" if not specified).
${isReturn ? 'For round trip also need return_date.' : ''}
When ready: confirm details naturally and say you are searching.`;

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
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...context.slice(-14),
                    { role: 'user', content: message }
                ],
                temperature: 0.5,
                max_tokens: 400,
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
                collected: {},
                ready: false
            };
        }

        // Clean city names — remove parentheses content and country suffixes
        // BUT preserve "Moscou Domodedovo", "Paris Orly" style airport names
        function cleanCity(name) {
            if (!name || name === 'null' || name === 'undefined') return null;
            return name
                .replace(/\s*\([^)]*\)/g, '')  // remove (anything in parens)
                .replace(/,.*$/g, '')           // remove ", France" etc
                .trim() || null;
        }

        const c = parsed.collected || {};

        const fromFinal   = cleanCity(c.from)       || known.from       || null;
        const toFinal     = cleanCity(c.to)         || known.to         || null;
        const datesFinal  = c.dates       && c.dates !== 'null'       ? c.dates       : known.date       || null;
        const retFinal    = c.return_date && c.return_date !== 'null' ? c.return_date : known.returnDate || null;
        // Default passengers to "1" if never specified
        const passFinal   = (c.passengers && c.passengers !== 'null') ? c.passengers
                          : known.passengers || (fromFinal && toFinal && datesFinal ? '1' : null);
        const budgetFinal = c.budget      && c.budget !== 'null'      ? c.budget      : null;

        // Auto-set ready when all core fields present
        const allPresent = fromFinal && toFinal && datesFinal && passFinal &&
            (!isReturn || retFinal);
        const isReady = parsed.ready === true || !!allPresent;

        return res.status(200).json({
            reply: String(parsed.reply || '').substring(0, 600),
            collected: {
                from:        fromFinal,
                to:          toFinal,
                dates:       datesFinal,
                return_date: isReturn ? retFinal : null,
                passengers:  passFinal,
                budget:      budgetFinal
            },
            ready: isReady
        });

    } catch (e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable', reply: null });
    }
}
