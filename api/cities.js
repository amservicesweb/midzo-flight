// api/cities.js — Autocomplete villes depuis data/airports.json
// Version CommonJS — compatible Vercel

const fs = require('fs');
const path = require('path');

let airportsData = null;

function loadAirports() {
    if (airportsData) return airportsData;
    try {
        const filePath = path.join(process.cwd(), 'data', 'airports.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        airportsData = JSON.parse(raw);
    } catch(e) {
        console.error('airports.json error:', e.message);
        airportsData = [];
    }
    return airportsData;
}

function normalize(str) {
    return (str || '').toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

module.exports = function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const q = req.query.q;
    if (!q || q.trim().length < 1) {
        return res.status(200).json({ locations: [] });
    }

    const airports = loadAirports();
    const query = normalize(q.trim());

    const startsWith = [];
    const contains = [];

    for (const a of airports) {
        if (!a.iata || !a.city) continue;
        const city = normalize(a.city);
        const iata = a.iata.toLowerCase();
        if (city.startsWith(query) || iata.startsWith(query)) {
            startsWith.push(a);
        } else if (city.includes(query)) {
            contains.push(a);
        }
        if (startsWith.length >= 8) break;
    }

    const results = [...startsWith, ...contains].slice(0, 8);
    return res.status(200).json({ locations: results });
};
