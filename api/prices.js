// api/prices.js — Travelpayouts Flight Data API · Midzo Flight
const rateMap = new Map();
function checkRate(ip){
  const now=Date.now(), win=60000, max=30;
  const e=rateMap.get(ip)||{c:0,r:now+win};
  if(now>e.r){e.c=0;e.r=now+win;}
  e.c++; rateMap.set(ip,e);
  return e.c<=max;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if(req.method==='OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]||'unknown';
  if(!checkRate(ip)) return res.status(429).json({error:'Too many requests'});

  const { origin, destination, currency='usd', lang='fr' } = req.query;
  if(!origin||!destination) return res.status(400).json({error:'Missing origin or destination'});

  const TOKEN = '7cf46628a75a50705c7a6dbdedcc7165';
  const MARKER = '696220';
  const TRS    = '488431';

  try {
    // Endpoint 1 : prix les moins chers par mois (cached, très rapide)
    const url = `https://api.travelpayouts.com/v1/prices/cheap?origin=${origin.toUpperCase()}&destination=${destination.toUpperCase()}&currency=${currency}&token=${TOKEN}`;
    const r = await fetch(url);

    if(!r.ok) throw new Error(`API ${r.status}`);
    const raw = await r.json();

    // La réponse est { "data": { "destination": { "0": {...}, "1": {...} } } }
    const data = raw?.data?.[destination.toUpperCase()] || raw?.data || {};
    const flights = [];

    Object.values(data).forEach(f => {
      if(!f || typeof f !== 'object') return;
      const depDate = f.departure_at || f.depart_date || '';
      const retDate = f.return_at    || f.return_date  || '';
      const price   = f.price        || f.value        || 0;
      const airline = f.airline      || '';
      const stops   = f.transfers    !== undefined ? f.transfers : (f.number_of_changes || 0);

      if(price > 0) flights.push({
        price,
        airline,
        stops,
        departure_at: depDate,
        return_at:    retDate,
        link: `https://tp.media/r?marker=${MARKER}&trs=${TRS}&p=4114&u=${encodeURIComponent(`https://aviasales.com/search/${origin.toUpperCase()}${formatDateShort(depDate)}${destination.toUpperCase()}1`)}`
      });
    });

    // Trier par prix
    flights.sort((a,b)=>a.price-b.price);

    return res.status(200).json({
      origin:      origin.toUpperCase(),
      destination: destination.toUpperCase(),
      currency,
      flights:     flights.slice(0,5), // top 5 moins chers
      search_link: `https://tp.media/r?marker=${MARKER}&trs=${TRS}&p=4114&u=${encodeURIComponent(`https://aviasales.com/search/${origin.toUpperCase()}0101${destination.toUpperCase()}1`)}`
    });

  } catch(e) {
    console.error('Prices API error:', e.message);
    return res.status(500).json({error:'Prices unavailable', message: e.message});
  }
}

function formatDateShort(iso){
  if(!iso) return '0101';
  try {
    const d = new Date(iso);
    return String(d.getDate()).padStart(2,'0') + String(d.getMonth()+1).padStart(2,'0');
  } catch(_){ return '0101'; }
}
