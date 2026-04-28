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

    // Build a clear picture of what's already known
    const known = {
        from:       collected.from        || null,
        to:         collected.to          || null,
        date:       collected.dates       || null,
        returnDate: collected.return_date || null,
        passengers: collected.passengers  || null,
    };
    const missingFields = [];
    if (!known.from)       missingFields.push('departure city');
    if (!known.to)         missingFields.push('destination');
    if (!known.date)       missingFields.push('departure date');
    if (isReturn && !known.returnDate) missingFields.push('return date');
    if (!known.passengers) missingFields.push('number of passengers');

    const SYSTEM_PROMPT = `You are Sofia, a friendly and expert AI travel agent at Midzo Flight.

LANGUAGE RULE: Always reply in ${forcedLang}. No exceptions. Even if the user writes in another language.

TRIP TYPE: ${isReturn ? 'ROUND TRIP — ask departure AND return dates' : 'ONE WAY — ask departure date only, NEVER ask for a return date'}

ALREADY KNOWN:
${known.from       ? `- Departure: ${known.from}`       : '- Departure: unknown'}
${known.to         ? `- Destination: ${known.to}`        : '- Destination: unknown'}
${known.date       ? `- Departure date: ${known.date}`   : '- Departure date: unknown'}
${isReturn && known.returnDate ? `- Return date: ${known.returnDate}` : isReturn ? '- Return date: unknown' : ''}
${known.passengers ? `- Passengers: ${known.passengers}` : '- Passengers: unknown'}

MISSING: ${missingFields.length ? missingFields.join(', ') : 'nothing — all collected'}

YOUR BEHAVIOR:
1. EXTRACT everything the user mentions in one message — city, date, passengers, trip type — all at once.
   Example: "Paris Lomé 15 juin 2 personnes" → extract all 4 fields immediately.
2. Ask ONLY for what is still missing — ONE question per reply, naturally.
3. NEVER re-ask for something already known.
4. NEVER use a list or bullet points. Talk like a human travel agent.
5. When you have departure, destination, date${isReturn ? ', return date,' : ''} and passengers → set ready: true.
6. Be warm and natural. You can add a short travel tip when relevant (1 sentence max).
7. If user asks off-topic → redirect naturally with humor.

DATE HANDLING:
- Accept any format: "30 avril", "30/04", "30/04/2026", "dans 2 semaines", "le 15 mai"
- Store dates as-is (do not convert to ISO yourself — the frontend handles that)
- For ONE WAY trips: NEVER ask for or store a return date

CITY NAMES:
- Return the SHORT city name only: "Paris", "Lomé", "Moscou", "Dubai"
- NOT "Paris (Charles de Gaulle)" — just "Paris"
- NOT "Lomé, Togo" — just "Lomé"

RESPONSE FORMAT — return ONLY this JSON, no markdown, no backticks, no extra text:
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

Set "ready": true ONLY when ALL required fields are collected:
- from ✓
- to ✓  
- dates ✓
${isReturn ? '- return_date ✓\n' : ''}- passengers ✓

When ready, your reply should confirm the trip details and say you are searching now.`;

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
                temperature: 0.6,
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
            // Fallback: extract reply field manually
            const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            parsed = {
                reply: m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : raw,
                collected: {},
                ready: false
            };
        }

        // Sanitize city names — strip parentheses and country suffixes
        function cleanCity(name) {
            if (!name || name === 'null') return null;
            return name
                .replace(/\s*\(.*?\)/g, '')   // remove (Charles de Gaulle International...)
                .replace(/,.*$/g, '')          // remove ", France" / ", Togo" etc
                .trim();
        }

        const c = parsed.collected || {};

        // Merge with already-known fields — never overwrite with null
        const fromFinal      = cleanCity(c.from)        || known.from       || null;
        const toFinal        = cleanCity(c.to)          || known.to         || null;
        const datesFinal     = c.dates        && c.dates !== 'null'        ? c.dates        : known.date       || null;
        const returnFinal    = c.return_date  && c.return_date !== 'null'  ? c.return_date  : known.returnDate || null;
        const passFinal      = c.passengers   && c.passengers !== 'null'   ? c.passengers   : known.passengers || null;
        const budgetFinal    = c.budget       && c.budget !== 'null'       ? c.budget       : null;

        // Auto-set ready if all fields present (safety net in case model forgot)
        const allPresent = fromFinal && toFinal && datesFinal && passFinal &&
            (!isReturn || returnFinal);
        const isReady = parsed.ready === true || allPresent;

        return res.status(200).json({
            reply: String(parsed.reply || '').substring(0, 600),
            collected: {
                from:        fromFinal,
                to:          toFinal,
                dates:       datesFinal,
                return_date: isReturn ? returnFinal : null,
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
