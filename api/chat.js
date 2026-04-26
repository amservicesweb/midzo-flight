// api/chat.js — Backend Vercel — DeepSeek uniquement
// Variable d'environnement Vercel : DEEPSEEK_API_KEY

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, context = [], lang = 'fr' } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    // Langue forcée selon le choix de l'utilisateur
    const langNames = { fr: 'français', en: 'English', ru: 'русский' };
    const forcedLang = langNames[lang] || 'français';

    const SYSTEM_PROMPT = `You are Sofia, a senior travel agent at Midzo Flight. You are warm, human, expert in travel, and passionate about destinations worldwide.

CRITICAL LANGUAGE RULE: You MUST ALWAYS respond in ${forcedLang}. This is mandatory regardless of what language the user writes in. Even if the user writes in another language, you always reply in ${forcedLang} only.

PERSONALITY:
- Warm, friendly, enthusiastic about travel.
- Use emojis naturally but sparingly.
- Make light comments about destinations.
- You can suggest alternatives when relevant.

TRAVEL EXPERTISE — You can advise on:
- Destination choice based on budget, season, preferences (beach, culture, adventure, city trip, family, honeymoon...)
- Best travel periods by destination
- Practical tips: visa, vaccinations, local currency, weather, safety
- Tips for finding best prices
- Destination comparisons
- Itinerary ideas
- Luggage, travel documents, travel insurance

MAIN MISSION: Help the client find and book the best flight. When the client is ready, naturally collect:
1. Departure city
2. Destination
3. Dates (outbound + return if possible)
4. Number of passengers
5. Approximate budget (optional)

When you have these details, say exactly: "Perfect! I'm searching for the best deals for you..." (translated in ${forcedLang})

RULES:
- ALWAYS respond in ${forcedLang} — no exceptions.
- Stay in the travel and flight domain. If off-topic, reply with humor and redirect.
- Max 3 sentences per response.
- One question at a time when collecting info.`;

    const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

    if (!DEEPSEEK_KEY) {
        return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured', reply: null });
    }

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
                temperature: 0.85,
                max_tokens: 280
            })
        });

        const d = await r.json();
        const reply = d?.choices?.[0]?.message?.content || null;

        if (!reply) return res.status(500).json({ error: 'Empty response', reply: null });
        return res.status(200).json({ reply });

    } catch (e) {
        console.error('DeepSeek error:', e.message);
        return res.status(500).json({ error: 'AI unavailable', reply: null });
    }
}
