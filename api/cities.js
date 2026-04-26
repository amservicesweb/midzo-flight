// api/cities.js — Autocomplete villes depuis fichier local
// Lit data/airports.json (généré par convert-airports.js)
// Zéro API externe, zéro coût, zéro quota

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chargement unique en mémoire au démarrage du serveur
let airportsData = null;

function loadAirports() {
    if (airportsData) return airportsData;
    try {
        const filePath = path.join(__dirname, '..', 'data', 'airports.json');
        const raw = fs.readFileSync(filePath, 'utf8');
        airportsData = JSON.parse(raw);
        console.log(`✅ ${airportsData.length} airports loaded`);
    } catch(e) {
        console.error('airports.json not found — run convert-airports.js first');
        airportsData = [];
    }
    return airportsData;
}

// Normalise les accents pour la recherche
function normalize(str) {
    return (str || '').toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { q } = req.query;
    if (!q || q.trim().length < 1) {
        return res.status(200).json({ locations: [] });
    }

    const airports = loadAirports();
    const query = normalize(q.trim());

    // Recherche : commence par la query en priorité, puis contient
    const startsWith = [];
    const contains   = [];

    for (const a of airports) {
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
}
