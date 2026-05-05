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

    const { message, context = [], lang = 'fr', collected = {}, tripType = 'oneway', mode = 'search' } = req.body;
    if (!message || typeof message !== 'string' || message.length > 500)
        return res.status(400).json({ error: 'Invalid message' });
    if (!['fr', 'en', 'ru'].includes(lang))
        return res.status(400).json({ error: 'Invalid language' });

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'API not configured', reply: null });

    const langMap = { fr: 'French', en: 'English', ru: 'Russian' };

    // ── MODE ADVISOR : Sofia conseillère voyage pure ──
    if (mode === 'advisor') {
        const ADVISOR_PROMPT = `You are Sofia, an expert AI travel advisor for Midzo Flight.
LANGUAGE: Always reply in ${langMap[lang]}. No exceptions.
YOUR ROLE: Help people with destination advice, best time to visit, visa requirements, travel tips, budget advice, safety info, local customs.
You do NOT book flights — direct users to search.midzoflight.com for that.
STYLE: Warm, knowledgeable, concise. Max 3-4 sentences. Give specific actionable advice.`;

        try {
            const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: ADVISOR_PROMPT },
                        ...context.slice(-10),
                        { role: 'user', content: message }
                    ],
                    temperature: 0.8,
                    max_tokens: 400
                })
            });
            if (!r.ok) return res.status(502).json({ error: 'AI error', reply: null });
            const d = await r.json();
            const reply = d?.choices?.[0]?.message?.content || '';
            return res.status(200).json({ reply: String(reply).substring(0, 600) });
        } catch(e) {
            return res.status(500).json({ error: 'AI unavailable', reply: null });
        }
    }

    const isReturn = tripType === 'return';

    const known = {
        from:       collected.from        || null,
        to:         collected.to          || null,
        date:       collected.dates       || null,
        returnDate: collected.return_date || null,
        passengers: collected.passengers  || null,
    };

    // ── Prompt Sofia — naturel, sans logique de formulaire ──
    const SOFIA_PROMPT = `You are Sofia, a smart AI travel agent for Midzo Flight. You help people find flights in a natural, human way.

LANGUAGE: Always reply in ${langMap[lang]}. Always.

CURRENT TRIP STATE:
- From: ${known.from || 'unknown'}
- To: ${known.to || 'unknown'}
- Date: ${known.date || 'unknown'}
- Return: ${known.returnDate || 'none'}
- Passengers: ${known.passengers || 'unknown'}
- Trip type: ${isReturn ? 'round trip' : 'one way'}

YOUR JOB:
Extract flight info from what the user says and have a natural conversation.
When you have everything needed, confirm and say you're searching.

EXTRACTION RULES:
- Extract ALL info from a single message at once
- Accept any date format: "21/05/26", "15 mai", "dans 2 semaines", "May 15th"
- Accept city names in any language: "Abidjan", "Абиджан", "New York", "Нью-Йорк"  
- If passengers not mentioned → default to 1, don't ask
- If new cities mentioned → it's a new trip, forget old data

CONVERSATION STYLE:
- Max 1-2 sentences
- Natural and warm
- Never ask multiple questions at once
- Don't repeat yourself
- React to what was said

JSON RESPONSE (strict, no markdown):
{
  "reply": "your reply in ${langMap[lang]}",
  "collected": {
    "from": "city name or null",
    "to": "city name or null", 
    "dates": "date as user wrote or null",
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
