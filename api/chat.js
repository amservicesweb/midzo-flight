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

YOUR CORE BEHAVIOR:

1. EXTRACT EVERYTHING IN ONE SHOT
   When the user provides multiple pieces of info in one message, extract ALL of them at once.
   "Paris Lomé 15 juin 2 personnes" → from=Paris, to=Lomé, dates=15 juin, passengers=2, ready=true
   "cherche moi un vol Accra-Moscou 03/05/2026 2 passagers" → from=Accra, to=Moscou, dates=03/05/2026, passengers=2, ready=true
   Never ignore any piece of information the user gives.

2. DETECT NEW ROUTE AUTOMATICALLY
   If the user mentions cities DIFFERENT from the current state, it's a new search.
   Reset everything and start fresh with the new route — don't mix old and new data.
   Current: ${known.from || '?'} → ${known.to || '?'}
   If user says different cities → new trip entirely.

3. ASK ONLY WHAT'S MISSING
   After extracting, if something is still missing, ask for ONE thing only, naturally.
   Never ask for something already known.
   Never use bullet points or lists.

4. HANDLE AIRPORT PREFERENCES
   If user specifies an airport (e.g. "aéroport Domodedovo", "DME", "CDG", "Orly"):
   - Note it in your reply but still use the CITY name in "to" or "from" field
   - The IATA code for that specific airport will be handled by the system
   - Example: "Moscou Domodedovo" → to: "Moscou", mention DME in reply

5. BE READY IMMEDIATELY
   Set ready: true as soon as you have: from, to, departure date${isReturn ? ', return date,' : ','} and passengers.
   Don't ask unnecessary questions like budget unless user brings it up.

6. PERSONALITY
   Warm, concise, human. Max 2 sentences. Add a quick travel tip only when it fits naturally.
   React to what the user says — don't repeat yourself.

STRICT RULES FOR "from" AND "to" FIELDS:
- Use SHORT city name ONLY: "Paris" not "Paris (Charles de Gaulle)"
- "Moscou" not "Moscou (Domodedovo)" — just the city
- Never append airport name, country, or parentheses to city names

RESPONSE FORMAT — return ONLY this JSON, zero markdown, zero backticks:
{
  "reply": "Your natural reply in ${forcedLang}",
  "collected": {
    "from": "short city name or null",
    "to": "short city name or null",
    "dates": "departure date as user wrote it, or null",
    "return_date": "${isReturn ? 'return date as user wrote it, or null' : 'null'}",
    "passengers": "number as string or null",
    "budget": "budget or null"
  },
  "ready": false
}

Set ready: true ONLY when ALL of these are filled: from, to, dates, passengers${isReturn ? ', return_date' : ''}.
When ready, confirm the trip details in your reply and say you are searching now.`;

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

        // Clean city names — strip parentheses, airport names, country suffixes
        function cleanCity(name) {
            if (!name || name === 'null' || name === 'undefined') return null;
            return name
                .replace(/\s*\(.*?\)/g, '')
                .replace(/,.*$/g, '')
                .trim() || null;
        }

        const c = parsed.collected || {};

        const fromFinal   = cleanCity(c.from)       || known.from       || null;
        const toFinal     = cleanCity(c.to)         || known.to         || null;
        const datesFinal  = c.dates       && c.dates !== 'null'       ? c.dates       : known.date       || null;
        const retFinal    = c.return_date && c.return_date !== 'null' ? c.return_date : known.returnDate || null;
        const passFinal   = c.passengers  && c.passengers !== 'null'  ? c.passengers  : known.passengers || null;
        const budgetFinal = c.budget      && c.budget !== 'null'      ? c.budget      : null;

        // Auto-set ready as safety net
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
