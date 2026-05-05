// api/chat.js — Sofia · Midzo Flight (FIXED VERSION)

const rateLimitMap = new Map();

function checkRateLimit(ip) {
    const now = Date.now(), win = 60000, max = 30;
    const e = rateLimitMap.get(ip) || { c: 0, r: now + win };
    if (now > e.r) { e.c = 0; e.r = now + win; }
    e.c++;
    rateLimitMap.set(ip, e);
    return e.c <= max;
}

function isReady(collected, isReturn) {
    const ok = !!(collected.from && collected.to && collected.dates && collected.passengers);
    if (!ok) return false;
    if (isReturn && !collected.return_date) return false;
    return true;
}

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
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Too many requests', reply: null });
    }

    const {
        message,
        context = [],
        lang = 'fr',
        collected = {},
        tripType = 'oneway',
        mode = 'advisor'
    } = req.body;

    if (!message || typeof message !== 'string' || message.length > 500) {
        return res.status(400).json({ error: 'Invalid message' });
    }

    if (!['fr', 'en', 'ru'].includes(lang)) {
        return res.status(400).json({ error: 'Invalid language' });
    }

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_KEY) {
        return res.status(500).json({ error: 'API not configured', reply: null });
    }

    const langMap = { fr: 'French', en: 'English', ru: 'Russian' };

    // =========================
    // MODE ADVISOR (FIXED)
    // =========================
    if (mode === 'advisor') {
        const PROMPT = `You are Sofia, an expert AI travel advisor for Midzo Flight.
LANGUAGE: Always reply in ${langMap[lang]}.
ROLE: Help with destinations, seasons, visas, tips, budget, safety.
If user wants flights → send them to search.midzoflight.com.
STYLE: Warm, concise, max 3-4 sentences.`;

        try {
            const r = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: PROMPT },
                        ...context.slice(-10),
                        { role: 'user', content: message }
                    ],
                    temperature: 0.7,
                    max_tokens: 400
                })
            });

            const text = await r.text();
            console.log("DeepSeek advisor raw:", text);

            if (!r.ok) {
                return res.status(502).json({
                    error: 'AI error',
                    details: text,
                    reply: null
                });
            }

            let data;
            try {
                data = JSON.parse(text);
            } catch {
                return res.status(500).json({
                    error: 'Invalid JSON from AI',
                    reply: text
                });
            }

            const reply = data?.choices?.[0]?.message?.content || "No response";

            return res.status(200).json({
                reply: reply.substring(0, 600)
            });

        } catch (e) {
            console.error("Advisor crash:", e);
            return res.status(500).json({
                error: 'AI unavailable',
                details: e.message,
                reply: null
            });
        }
    }

    // =========================
    // MODE SEARCH (UNCHANGED BUT STABILIZED)
    // =========================

    const isReturn = tripType === 'return';

    const known = {
        from: collected.from || null,
        to: collected.to || null,
        date: collected.dates || null,
        returnDate: collected.return_date || null,
        passengers: collected.passengers || null
    };

    const PROMPT = `You are Sofia, a flight assistant.

Reply in ${langMap[lang]}.
Extract flight info naturally.

JSON ONLY:
{
  "reply": "...",
  "collected": {
    "from": "...",
    "to": "...",
    "dates": "...",
    "return_date": "...",
    "passengers": "..."
  }
}`;

    try {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: PROMPT },
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        const text = await r.text();
        console.log("DeepSeek search raw:", text);

        if (!r.ok) {
            return res.status(502).json({ error: 'AI error', reply: null });
        }

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            return res.status(500).json({
                error: 'JSON parse failed',
                raw: text
            });
        }

        const c = parsed.collected || {};

        const finalCollected = {
            from: cleanCity(c.from) || known.from,
            to: cleanCity(c.to) || known.to,
            dates: c.dates || known.date,
            return_date: isReturn ? (c.return_date || known.returnDate) : null,
            passengers: c.passengers || known.passengers
        };

        return res.status(200).json({
            reply: parsed.reply || '',
            collected: finalCollected,
            ready: isReady(finalCollected, isReturn)
        });

    } catch (e) {
        console.error("Search crash:", e);
        return res.status(500).json({
            error: 'AI unavailable',
            details: e.message
        });
    }
}
