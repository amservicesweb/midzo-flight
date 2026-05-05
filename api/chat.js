// api/chat.js — Sofia conseil voyage (mode simplifié)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, context = [], lang = 'fr' } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_KEY) return res.status(500).json({ error: 'API not configured' });

  const SYSTEM_PROMPT = `Tu es Sofia, conseillère voyage IA chez Midzo Flight.
Parle en ${lang === 'fr' ? 'français' : lang === 'en' ? 'anglais' : 'russe'}.
Ton rôle : conseiller les voyageurs sur les destinations, meilleures périodes, budget, astuces, visas, climat.
Tu NE génères PAS de liens de recherche. Tu ne prends PAS de réservation.
Sois chaleureuse, experte et concise (3-5 phrases max).`;

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
          ...context.slice(-6),
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 400
      })
    });

    if (!r.ok) return res.status(502).json({ error: 'AI error' });
    const d = await r.json();
    return res.status(200).json({ reply: d.choices[0].message.content });
  } catch (e) {
    return res.status(500).json({ error: 'AI unavailable' });
  }
}
