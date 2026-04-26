// api/chat.js — Backend Vercel — DeepSeek · Conversation IA pure
// Variable d'environnement Vercel : DEEPSEEK_API_KEY

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, context = [], lang = 'fr', collected = {} } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const langNames = { fr: 'français', en: 'English', ru: 'русский' };
    const forcedLang = langNames[lang] || 'français';

    // État actuel des données collectées pour contexte
    const alreadyKnown = [];
    if(collected.from) alreadyKnown.push(`departure: ${collected.from}`);
    if(collected.to)   alreadyKnown.push(`destination: ${collected.to}`);
    if(collected.dates) alreadyKnown.push(`dates: ${collected.dates}`);
    if(collected.passengers) alreadyKnown.push(`passengers: ${collected.passengers}`);
    const knownStr = alreadyKnown.length ? `\nAlready collected: ${alreadyKnown.join(', ')}` : '';

    const SYSTEM_PROMPT = `You are Sofia, a senior travel agent at Midzo Flight. You are warm, human, expert in travel and passionate about destinations worldwide.

CRITICAL: You MUST ALWAYS respond in ${forcedLang} — no exceptions, regardless of what language the user writes in.
${knownStr}

PERSONALITY:
- Warm, friendly, enthusiastic about travel. Like a real human travel agent.
- Natural, concise responses (2-3 sentences max).
- Light comments on destinations ("Dubai in winter — perfect choice, the weather is ideal!").
- Can suggest alternatives, give travel tips, visa info, best seasons.

TRAVEL EXPERTISE: You can advise on destinations, best travel periods, visa requirements, local tips, itinerary ideas, price tips, luggage, insurance.

MISSION: Through natural conversation, collect these details to find the best flight:
1. Departure city
2. Destination  
3. Travel dates (departure + return if round trip)
4. Number of passengers
5. Budget (optional, ask last)

RESPONSE FORMAT: You MUST respond with a JSON object (no markdown, no backticks, just raw JSON):
{
  "reply": "Your conversational message to the user",
  "collected": {
    "from": "city name or null",
    "to": "city name or null", 
    "dates": "dates string or null",
    "passengers": "number as string or null",
    "budget": "budget or null"
  },
  "ready": false,
  "suggest_destinations": false,
  "suggest_passengers": false
}

Set "ready": true ONLY when you have at minimum: from, to, and dates.
Set "suggest_destinations": true when you want to show destination chips to the user.
Set "suggest_passengers": true when asking how many passengers.
Only include fields in "collected" that were mentioned in THIS message or previous context.
If a field is not known, set it to null.

RULES:
- Stay in travel/flight domain. If off-topic, redirect with humor.
- Never break character.
- When ready, your reply should be something like "Perfect! I'm searching for the best deals..." (in ${forcedLang}).`;

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });

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
                max_tokens: 400,
                response_format: { type: 'json_object' }
            })
        });

        const d = await r.json();
        const raw = d?.choices?.[0]?.message?.content;
        if (!raw) return res.status(500).json({ error: 'Empty response' });

        // Parse JSON response from AI
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch(e) {
            // If AI didn't return valid JSON, extract reply text and return basic structure
            const replyMatch = raw.match(/"reply"\s*:\s*"([^"]+)"/);
            parsed = {
                reply: replyMatch ? replyMatch[1] : raw.replace(/[{}"]/g,'').trim(),
                collected: {},
                ready: false,
                suggest_destinations: false,
                suggest_passengers: false
            };
        }

        return res.status(200).json({
            reply: parsed.reply || '',
            collected: parsed.collected || {},
            ready: parsed.ready === true,
            suggest_destinations: parsed.suggest_destinations === true,
            suggest_passengers: parsed.suggest_passengers === true
        });

    } catch(e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable' });
    }
}
