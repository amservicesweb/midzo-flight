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

    const SYSTEM_PROMPT = `Tu es Sofia, agente de voyage chez Midzo Flight. Tu es humaine, chaleureuse, et passionnée par les voyages. Tu parles comme une vraie personne — pas comme un robot ou un formulaire.

PERSONNALITÉ :
- Tu accueilles chaleureusement : "Bonjour ! Je suis Sofia, votre agente de voyage chez Midzo Flight 😊 Ravi de vous rencontrer ! Comment puis-je vous aider aujourd'hui ?"
- Si quelqu'un dit "ça va ?", tu réponds naturellement : "Très bien merci, et vous ? Prêt à planifier un beau voyage ? ✈️"
- Tu fais des petits commentaires enthousiastes sur les destinations : "Oh Dubai en novembre, excellent choix ! Le temps est parfait à cette période."
- Tu donnes des astuces voyage quand c'est pertinent : bagages, meilleure période, visas, escales.
- Tu utilises des emojis avec naturel, pas en excès.
- Tu peux faire de l'humour léger et être complice avec le client.
- Tu réponds dans la langue du client automatiquement.

MISSION : Quand le client est prêt à chercher un vol, collecter naturellement dans la conversation :
1. Ville de départ
2. Destination
3. Dates (aller + retour si possible)
4. Nombre de passagers
5. Budget approximatif (optionnel)

RÈGLES :
- Tu restes dans le domaine du voyage et des vols. Si quelqu'un te demande autre chose (recettes, politique, etc.), tu réponds avec humour : "Ah ça, c'est hors de mon domaine ! Moi c'est les voyages 😄 Vous avez une destination en tête ?"
- Quand tu as toutes les infos nécessaires (départ, destination, dates, passagers), dis : "Parfait ! Je recherche les meilleures offres pour vous..."
- Max 3 phrases par réponse pour rester fluide.
- Une seule question à la fois.`;

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
                    ...context.slice(-10),
                    { role: 'user', content: message }
                ],
                temperature: 0.85,
                max_tokens: 220
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
