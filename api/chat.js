// api/chat.js — Backend Vercel sécurisé — DeepSeek
// Variable d'environnement : DEEPSEEK_API_KEY

// ── Rate limiting en mémoire (reset à chaque cold start Vercel) ──────────────
const rateLimitMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 20;     // 20 messages/minute par IP
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
    if(now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    rateLimitMap.set(ip, entry);
    return entry.count <= maxRequests;
}

// ── Simple response cache (évite appels dupliqués) ────────────────────────────
const responseCache = new Map();
function getCacheKey(message, lang) {
    return `${lang}:${message.toLowerCase().trim().substring(0, 50)}`;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Rate limiting ─────────────────────────────────────────────────────────
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
    if(!checkRateLimit(ip)){
        return res.status(429).json({ error: 'Too many requests', reply: null });
    }

    // ── Input validation ──────────────────────────────────────────────────────
    const { message, context = [], lang = 'fr', collected = {} } = req.body;
    if(!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid message' });
    }
    if(message.length > 500) {
        return res.status(400).json({ error: 'Message too long' });
    }
    if(!['fr','en','ru'].includes(lang)) {
        return res.status(400).json({ error: 'Invalid language' });
    }

    // ── API key check ─────────────────────────────────────────────────────────
    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if(!DEEPSEEK_KEY) {
        return res.status(500).json({ error: 'API not configured', reply: null });
    }

    // ── Build system prompt ───────────────────────────────────────────────────
    const langNames = { fr:'français', en:'English', ru:'русский' };
    const forcedLang = langNames[lang];
    const alreadyKnown = [];
    if(collected.from) alreadyKnown.push(`departure: ${collected.from}`);
    if(collected.to)   alreadyKnown.push(`destination: ${collected.to}`);
    if(collected.dates) alreadyKnown.push(`dates: ${collected.dates}`);
    if(collected.passengers) alreadyKnown.push(`passengers: ${collected.passengers}`);
    const knownStr = alreadyKnown.length ? `\nAlready collected: ${alreadyKnown.join(', ')}` : '';

    const SYSTEM_PROMPT = `You are Sofia, a senior travel agent at Midzo Flight. Warm, human, expert in travel.

CRITICAL: Always respond in ${forcedLang} only — no exceptions.
${knownStr}

PERSONALITY: Friendly, concise (2-3 sentences), enthusiastic. Give destination tips, visa info, best seasons when relevant. You can also help choose a destination if the user is undecided.

MISSION: Through natural conversation, collect: departure city, destination, travel dates, passengers, budget (optional).

RESPONSE FORMAT — return ONLY valid JSON, no markdown:
{
  "reply": "Your message to the user in ${forcedLang}",
  "collected": {
    "from": "city or null",
    "to": "city or null",
    "dates": "dates string or null",
    "passengers": "number as string or null",
    "budget": "budget or null"
  },
  "ready": false,
  "suggest_destinations": false,
  "suggest_passengers": false
}

Set "ready": true ONLY when you have from, to, AND dates.
Set "suggest_destinations": true when you want to show destination suggestions.
Set "suggest_passengers": true when asking about passengers.
Only include newly extracted fields in "collected" — set others to null.
If off-topic (not travel related), redirect with humor and set all collected fields to null.
When ready, your reply should say you're searching (in ${forcedLang}).`;

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
                    ...context.slice(-12),
                    { role: 'user', content: message }
                ],
                temperature: 0.8,
                max_tokens: 350,
                response_format: { type: 'json_object' }
            })
        });

        if(!r.ok) {
            const err = await r.text();
            console.error('DeepSeek HTTP error:', r.status, err);
            return res.status(502).json({ error: 'AI service error', reply: null });
        }

        const d = await r.json();
        const raw = d?.choices?.[0]?.message?.content;
        if(!raw) return res.status(500).json({ error: 'Empty AI response', reply: null });

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch(e) {
            // Fallback: extract reply text if JSON parsing fails
            const match = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            parsed = {
                reply: match ? match[1].replace(/\\n/g,'\n').replace(/\\"/g,'"') : raw,
                collected: {}, ready: false,
                suggest_destinations: false, suggest_passengers: false
            };
        }

        // Sanitize output
        const response = {
            reply: String(parsed.reply || '').substring(0, 600),
            collected: {
                from: parsed.collected?.from || null,
                to: parsed.collected?.to || null,
                dates: parsed.collected?.dates || null,
                passengers: parsed.collected?.passengers || null,
                budget: parsed.collected?.budget || null
            },
            ready: parsed.ready === true,
            suggest_destinations: parsed.suggest_destinations === true,
            suggest_passengers: parsed.suggest_passengers === true
        };

        return res.status(200).json(response);

    } catch(e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable', reply: null });
    }
}
