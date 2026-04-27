// api/chat.js — DeepSeek · JSON-driven · Sécurisé
const rateLimitMap = new Map();
function checkRateLimit(ip) {
    const now = Date.now(), win = 60000, max = 20;
    const e = rateLimitMap.get(ip) || {c:0, r:now+win};
    if(now > e.r){e.c=0; e.r=now+win;}
    e.c++; rateLimitMap.set(ip,e);
    return e.c <= max;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    if(!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests', reply: null });

    const { message, context = [], lang = 'fr', collected = {}, tripType = 'return' } = req.body;
    if(!message || typeof message !== 'string' || message.length > 500)
        return res.status(400).json({ error: 'Invalid message' });
    if(!['fr','en','ru'].includes(lang))
        return res.status(400).json({ error: 'Invalid language' });

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if(!DEEPSEEK_KEY) return res.status(500).json({ error: 'API not configured', reply: null });

    const langNames = { fr:'français', en:'English', ru:'русский' };
    const forcedLang = langNames[lang];
    const isReturn = tripType === 'return';

    const known = [];
    if(collected.from) known.push(`departure: ${collected.from}`);
    if(collected.to)   known.push(`destination: ${collected.to}`);
    if(collected.dates) known.push(`dates: ${collected.dates}`);
    if(collected.passengers) known.push(`passengers: ${collected.passengers}`);
    const knownStr = known.length ? `\nAlready collected: ${known.join(', ')}` : '';

    const SYSTEM_PROMPT = `You are Sofia, a senior travel agent at Midzo Flight. Warm, human, expert in travel.

CRITICAL: Always respond in ${forcedLang} only — no exceptions.
Trip type selected by user: ${isReturn ? 'ROUND TRIP (aller-retour)' : 'ONE WAY (aller simple)'}
${knownStr}

PERSONALITY: Friendly, concise (2-3 sentences max). Give destination tips, visa info, best seasons when relevant. Help choose destinations if undecided.

MISSION: Collect through natural conversation:
1. Departure city
2. Destination
3. ${isReturn ? 'Departure date AND return date' : 'Departure date only'}
4. Number of passengers
5. Budget (optional, ask last)

IMPORTANT DATE RULES:
- Trip type is ${isReturn ? 'ROUND TRIP' : 'ONE WAY'} — ${isReturn ? 'ask for BOTH departure and return dates' : 'ask for departure date ONLY, do NOT ask for return date'}
- When user gives a date like "30/04/2026", treat it as the DEPARTURE date only unless they explicitly mention both dates
- Never invent or assume a return date

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no backticks:
{
  "reply": "Your message in ${forcedLang}",
  "collected": {
    "from": "city or null",
    "to": "city or null",
    "dates": "departure date string or null",
    "return_date": "${isReturn ? 'return date string or null' : 'null — one way trip'}",
    "passengers": "number as string or null",
    "budget": "budget or null"
  },
  "ready": false,
  "suggest_destinations": false,
  "suggest_passengers": false
}

Set "ready": true ONLY when you have: from, to, departure date${isReturn ? ', and return date' : ''}, and passengers.
Set "suggest_destinations": true when showing destination chips.
Set "suggest_passengers": true when asking about passengers.
When ready, say you are searching (in ${forcedLang}).
If off-topic, redirect with humor.`;

    try {
        const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...context.slice(-12),
                    { role: 'user', content: message }
                ],
                temperature: 0.75,
                max_tokens: 350,
                response_format: { type: 'json_object' }
            })
        });

        if(!r.ok) return res.status(502).json({ error: 'AI service error', reply: null });

        const d = await r.json();
        const raw = d?.choices?.[0]?.message?.content;
        if(!raw) return res.status(500).json({ error: 'Empty response', reply: null });

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch(e) {
            const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            parsed = { reply: m ? m[1].replace(/\\n/g,'\n').replace(/\\"/g,'"') : raw, collected:{}, ready:false, suggest_destinations:false, suggest_passengers:false };
        }

        return res.status(200).json({
            reply: String(parsed.reply||'').substring(0,600),
            collected: {
                from: parsed.collected?.from || null,
                to: parsed.collected?.to || null,
                dates: parsed.collected?.dates || null,
                return_date: parsed.collected?.return_date || null,
                passengers: parsed.collected?.passengers || null,
                budget: parsed.collected?.budget || null
            },
            ready: parsed.ready === true,
            suggest_destinations: parsed.suggest_destinations === true,
            suggest_passengers: parsed.suggest_passengers === true
        });

    } catch(e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable', reply: null });
    }
}
