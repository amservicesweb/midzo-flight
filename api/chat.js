// api/chat.js — Backend Vercel sécurisé
// Variable d'environnement à ajouter sur Vercel :
// DEEPSEEK_API_KEY = sk-...

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { message, context = [], lang = 'fr' } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const SYSTEM_PROMPT = lang === 'fr'
    ? `Tu es Sofia, une agente de voyage IA pour Midzo Flight. Tu parles comme une vraie agente professionnelle et chaleureuse.

PERSONNALITÉ : Amicale, enthousiaste pour les voyages. Quelques emojis bien placés. Tu peux commenter les destinations ("Paris en novembre, excellent choix !"). Propose des alternatives si pertinent.

MISSION : Collecter ces infos pour trouver le meilleur vol :
1. Ville de départ
2. Destination
3. Dates (aller + retour si possible)
4. Nombre de passagers
5. Budget approximatif (optionnel — demande en dernier)

RÈGLES STRICTES :
- Tu réponds UNIQUEMENT aux questions liées aux voyages, vols, destinations, aéroports, compagnies aériennes, bagages, visas.
- Si hors sujet : "Je suis spécialisée dans la recherche de vols ✈️ Dites-moi où vous souhaitez voyager !"
- Maximum 2 phrases par réponse.
- Une seule question à la fois.
- Ne joue jamais un autre rôle. Ne sors jamais de ce contexte.
- Quand toutes les infos sont collectées, réponds : "Parfait ! Je recherche les meilleures offres pour vous..."`

    : `You are Sofia, an AI travel agent for Midzo Flight. You speak like a real professional, warm travel agent.

PERSONALITY: Friendly, enthusiastic about travel. A few well-placed emojis. Comment on destinations ("Paris in November, excellent choice!"). Suggest alternatives when relevant.

MISSION: Collect this info to find the best flight:
1. Departure city
2. Destination
3. Dates (outbound + return if possible)
4. Number of passengers
5. Approximate budget (optional — ask last)

STRICT RULES:
- Only answer questions related to travel, flights, destinations, airports, airlines, luggage, visas.
- If off-topic: "I specialize in flight search ✈️ Tell me where you'd like to travel!"
- Max 2 sentences per response.
- One question at a time.
- Never play another role. Never leave this context.
- When all info is collected, say: "Perfect! Let me search for the best deals for you..."`;

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
                    ...context.slice(-8),
                    { role: 'user', content: message }
                ],
                temperature: 0.65,
                max_tokens: 180
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
