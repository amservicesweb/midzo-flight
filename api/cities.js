// api/cities.js — Autocomplete villes avec support français
const fs = require('fs');
const path = require('path');

let airportsData = null;

function loadAirports() {
    if (airportsData) return airportsData;
    try {
        const filePath = path.join(process.cwd(), 'data', 'airports.json');
        airportsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

// Traductions français → anglais (noms de villes)
const FR_TO_EN = {
    'moscou':'moscow','londres':'london','rome':'rome','vienne':'vienna',
    'varsovie':'warsaw','bruxelles':'brussels','geneve':'geneva',
    'zurich':'zurich','lisbonne':'lisbon','barcelone':'barcelona',
    'madrid':'madrid','munich':'munich','francfort':'frankfurt',
    'amsterdam':'amsterdam','copenhague':'copenhagen','stockholm':'stockholm',
    'oslo':'oslo','helsinki':'helsinki','athenes':'athens','budapest':'budapest',
    'prague':'prague','bucarest':'bucharest','sofia':'sofia','zagreb':'zagreb',
    'belgrade':'belgrade','sarajevo':'sarajevo','tirana':'tirana',
    'nicosie':'nicosia','beyrouth':'beirut','damas':'damascus',
    'bagdad':'baghdad','teheran':'tehran','riyad':'riyadh','koweït':'kuwait',
    'kuwait':'kuwait','le caire':'cairo','alexandrie':'alexandria',
    'tunis':'tunis','alger':'algiers','casablanca':'casablanca',
    'lome':'lome','abidjan':'abidjan','dakar':'dakar','accra':'accra',
    'cotonou':'cotonou','niamey':'niamey','bamako':'bamako',
    'ouagadougou':'ouagadougou','ndjamena':'ndjamena','bangui':'bangui',
    'libreville':'libreville','yaounde':'yaounde','douala':'douala',
    'kinshasa':'kinshasa','brazzaville':'brazzaville','luanda':'luanda',
    'nairobi':'nairobi','addis abeba':'addis ababa','khartoum':'khartoum',
    'djibouti':'djibouti','mogadiscio':'mogadishu','kampala':'kampala',
    'kigali':'kigali','dar es salam':'dar es salaam','maputo':'maputo',
    'lusaka':'lusaka','harare':'harare','johannesburg':'johannesburg',
    'le cap':'cape town','pretoria':'pretoria','antananarivo':'antananarivo',
    'ile maurice':'mauritius','pekin':'beijing','seoul':'seoul',
    'bangkok':'bangkok','singapour':'singapore','kuala lumpur':'kuala lumpur',
    'jakarta':'jakarta','manille':'manila','tokyo':'tokyo','osaka':'osaka',
    'bombay':'mumbai','mumbai':'mumbai','delhi':'delhi','calcutta':'kolkata',
    'new york':'new york','los angeles':'los angeles','chicago':'chicago',
    'miami':'miami','montreal':'montreal','toronto':'toronto',
    'vancouver':'vancouver','sao paulo':'sao paulo','rio':'rio de janeiro',
    'buenos aires':'buenos aires','lima':'lima','bogota':'bogota',
    'mexico':'mexico city','sydney':'sydney','melbourne':'melbourne',
    'auckland':'auckland','dubai':'dubai','abu dhabi':'abu dhabi',
    'doha':'doha','mascate':'muscat','istanbul':'istanbul','ankara':'ankara',
    'paris':'paris','lyon':'lyon','marseille':'marseille','nice':'nice',
    'toulouse':'toulouse','bordeaux':'bordeaux','nantes':'nantes',
    'strasbourg':'strasbourg','lille':'lille','montpellier':'montpellier',
};

module.exports = function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const q = req.query.q;
    if (!q || q.trim().length < 1) {
        return res.status(200).json({ locations: [] });
    }

    const airports = loadAirports();
    const queryRaw = normalize(q.trim());

    // Traduit si c'est un nom français connu
    const queryEN = FR_TO_EN[queryRaw] || queryRaw;

    const startsWith = [];
    const contains = [];

    for (const a of airports) {
        if (!a.iata || !a.city) continue;
        const city = normalize(a.city);
        const iata = a.iata.toLowerCase();

        const matchesRaw = city.startsWith(queryRaw) || iata.startsWith(queryRaw);
        const matchesEN  = queryEN !== queryRaw && (city.startsWith(queryEN) || city.includes(queryEN));
        const matchesContain = city.includes(queryRaw) || (queryEN !== queryRaw && city.includes(queryEN));

        if (matchesRaw || matchesEN) {
            startsWith.push(a);
        } else if (matchesContain) {
            contains.push(a);
        }
        if (startsWith.length >= 8) break;
    }

    const results = [...startsWith, ...contains].slice(0, 8);
    return res.status(200).json({ locations: results });
};
