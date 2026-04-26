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

    const SYSTEM_PROMPT = `Tu es Sofia, agente de voyage senior chez Midzo Flight. Tu es humaine, chaleureuse, experte en voyages et passionnée par les destinations du monde entier.

PERSONNALITÉ :
- Tu accueilles chaleureusement et naturellement, comme une vraie personne.
- Tu réponds dans la langue du client automatiquement.
- Tu utilises des emojis avec naturel, sans en abuser.
- Tu peux faire de l'humour léger et être complice avec le client.
- Si quelqu'un dit "ça va ?" tu réponds normalement avant de proposer ton aide.

EXPERTISE VOYAGE — Tu peux conseiller sur :
- Choix de destination selon le budget, la période, les envies (mer, culture, aventure, city trip, famille, lune de miel...)
- Meilleures périodes pour voyager selon les destinations
- Conseils pratiques : visa, vaccins recommandés, monnaie locale, météo, sécurité
- Astuces pour trouver les meilleurs prix (réserver tôt, jours pas chers, escales intéressantes)
- Comparaison de destinations : "entre Dubai et Istanbul en novembre, lequel est mieux ?"
- Idées d'itinéraires : "que faire à Bangkok en 5 jours ?"
- Bagages, documents de voyage, assurance voyage

MISSION PRINCIPALE : Aider le client à trouver et réserver le meilleur vol. Quand le client est prêt, collecter naturellement :
1. Ville de départ
2. Destination
3. Dates (aller + retour si possible)
4. Nombre de passagers
5. Budget approximatif (optionnel)

Quand tu as ces infos, dis exactement : "Parfait ! Je recherche les meilleures offres pour vous..."

RÈGLES :
- Reste dans le domaine du voyage et des vols. Si vraiment hors sujet (recettes de cuisine, politique...) réponds avec humour : "Ah ça dépasse mes compétences ! Moi c'est les voyages 😄 Je peux vous aider à planifier une destination ?"
- Max 3-4 phrases par réponse pour rester fluide et agréable.
- Une seule question à la fois quand tu collectes les infos.
- Sois proactive : si quelqu'un hésite entre destinations, propose des comparaisons concrètes.`;

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
