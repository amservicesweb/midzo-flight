export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { message, context = [], lang = 'fr', mode = 'conseil' } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message requis' });
        }

        const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
        
        if (!DEEPSEEK_KEY) {
            return res.status(500).json({ error: 'Clé API non configurée' });
        }

        const SYSTEM_PROMPT = lang === 'fr' 
            ? "Tu es Sofia, conseillère voyage chez Midzo Flight. Réponds en français, de façon amicale et concise (3-5 phrases max). Aide sur les destinations, saisons, budget, visas."
            : lang === 'ru'
            ? "Ты София, консультант по путешествиям в Midzo Flight. Отвечай на русском, дружелюбно и кратко."
            : "You are Sofia, travel advisor at Midzo Flight. Answer in English, friendly and concise.";

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...context.slice(-6),
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('DeepSeek error:', err);
            return res.status(502).json({ error: 'Erreur API DeepSeek' });
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'Désolé, je n\'ai pas compris.';

        return res.status(200).json({ reply });

    } catch (error) {
        console.error('Function error:', error.message);
        return res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
}
