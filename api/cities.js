// api/cities.js — Autocomplete villes · FR + EN + RU · Midzo Flight
const fs   = require('fs');
const path = require('path');

let airportsData = null;
const cityRateMap = new Map();

function cityRateLimit(ip){
    const now=Date.now(), win=60000, max=60;
    const e=cityRateMap.get(ip)||{c:0,r:now+win};
    if(now>e.r){e.c=0;e.r=now+win;}
    e.c++; cityRateMap.set(ip,e);
    return e.c<=max;
}

function loadAirports(){
    if(airportsData) return airportsData;
    try {
        const fp = path.join(process.cwd(),'data','airports.json');
        airportsData = JSON.parse(fs.readFileSync(fp,'utf8'));
    } catch(e){
        console.error('airports.json error:',e.message);
        airportsData = [];
    }
    return airportsData;
}

function normalize(str){
    return (str||'').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[''`]/g,'').trim();
}

// ── Noms localisés par IATA ──
// Format: IATA → { fr, en, ru }
const CITY_NAMES = {
    // France
    CDG:{ fr:'Paris',          en:'Paris',          ru:'Париж' },
    ORY:{ fr:'Paris Orly',     en:'Paris Orly',     ru:'Париж Орли' },
    LYS:{ fr:'Lyon',           en:'Lyon',           ru:'Лион' },
    MRS:{ fr:'Marseille',      en:'Marseille',      ru:'Марсель' },
    NCE:{ fr:'Nice',           en:'Nice',           ru:'Ницца' },
    BOD:{ fr:'Bordeaux',       en:'Bordeaux',       ru:'Бордо' },
    TLS:{ fr:'Toulouse',       en:'Toulouse',       ru:'Тулуза' },
    NTE:{ fr:'Nantes',         en:'Nantes',         ru:'Нант' },
    LIL:{ fr:'Lille',          en:'Lille',          ru:'Лилль' },
    SXB:{ fr:'Strasbourg',     en:'Strasbourg',     ru:'Страсбург' },
    // UK
    LHR:{ fr:'Londres',        en:'London',         ru:'Лондон' },
    LGW:{ fr:'Londres Gatwick',en:'London Gatwick', ru:'Лондон Гатвик' },
    STN:{ fr:'Londres Stansted',en:'London Stansted',ru:'Лондон Станстед' },
    LCY:{ fr:'Londres City',   en:'London City',    ru:'Лондон Сити' },
    // Europe
    AMS:{ fr:'Amsterdam',      en:'Amsterdam',      ru:'Амстердам' },
    BRU:{ fr:'Bruxelles',      en:'Brussels',       ru:'Брюссель' },
    FRA:{ fr:'Francfort',      en:'Frankfurt',      ru:'Франкфурт' },
    MUC:{ fr:'Munich',         en:'Munich',         ru:'Мюнхен' },
    BER:{ fr:'Berlin',         en:'Berlin',         ru:'Берлин' },
    MAD:{ fr:'Madrid',         en:'Madrid',         ru:'Мадрид' },
    BCN:{ fr:'Barcelone',      en:'Barcelona',      ru:'Барселона' },
    FCO:{ fr:'Rome',           en:'Rome',           ru:'Рим' },
    MXP:{ fr:'Milan',          en:'Milan',          ru:'Милан' },
    LIS:{ fr:'Lisbonne',       en:'Lisbon',         ru:'Лиссабон' },
    GVA:{ fr:'Genève',         en:'Geneva',         ru:'Женева' },
    ZRH:{ fr:'Zurich',         en:'Zurich',         ru:'Цюрих' },
    VIE:{ fr:'Vienne',         en:'Vienna',         ru:'Вена' },
    CPH:{ fr:'Copenhague',     en:'Copenhagen',     ru:'Копенгаген' },
    ARN:{ fr:'Stockholm',      en:'Stockholm',      ru:'Стокгольм' },
    OSL:{ fr:'Oslo',           en:'Oslo',           ru:'Осло' },
    HEL:{ fr:'Helsinki',       en:'Helsinki',       ru:'Хельсинки' },
    WAW:{ fr:'Varsovie',       en:'Warsaw',         ru:'Варшава' },
    PRG:{ fr:'Prague',         en:'Prague',         ru:'Прага' },
    BUD:{ fr:'Budapest',       en:'Budapest',       ru:'Будапешт' },
    OTP:{ fr:'Bucarest',       en:'Bucharest',      ru:'Бухарест' },
    ATH:{ fr:'Athènes',        en:'Athens',         ru:'Афины' },
    // Russie / CEI
    SVO:{ fr:'Moscou',         en:'Moscow',         ru:'Москва' },
    DME:{ fr:'Moscou Domodedovo',en:'Moscow Domodedovo',ru:'Москва Домодедово' },
    VKO:{ fr:'Moscou Vnukovo', en:'Moscow Vnukovo', ru:'Москва Внуково' },
    LED:{ fr:'Saint-Pétersbourg',en:'Saint Petersburg',ru:'Санкт-Петербург' },
    KRR:{ fr:'Krasnodar',      en:'Krasnodar',      ru:'Краснодар' },
    AER:{ fr:'Sotchi',         en:'Sochi',          ru:'Сочи' },
    KZN:{ fr:'Kazan',          en:'Kazan',          ru:'Казань' },
    SVX:{ fr:'Ekaterinbourg',  en:'Yekaterinburg',  ru:'Екатеринбург' },
    OVB:{ fr:'Novossibirsk',   en:'Novosibirsk',    ru:'Новосибирск' },
    ROV:{ fr:'Rostov',         en:'Rostov',         ru:'Ростов-на-Дону' },
    KUF:{ fr:'Samara',         en:'Samara',         ru:'Самара' },
    IKT:{ fr:'Irkoutsk',       en:'Irkutsk',        ru:'Иркутск' },
    VVO:{ fr:'Vladivostok',    en:'Vladivostok',    ru:'Владивосток' },
    KJA:{ fr:'Krasnoïarsk',    en:'Krasnoyarsk',    ru:'Красноярск' },
    UFA:{ fr:'Oufa',           en:'Ufa',            ru:'Уфа' },
    TBS:{ fr:'Tbilissi',       en:'Tbilisi',        ru:'Тбилиси' },
    EVN:{ fr:'Erevan',         en:'Yerevan',        ru:'Ереван' },
    GYD:{ fr:'Bakou',          en:'Baku',           ru:'Баку' },
    ALA:{ fr:'Almaty',         en:'Almaty',         ru:'Алматы' },
    TAS:{ fr:'Tachkent',       en:'Tashkent',       ru:'Ташкент' },
    MSQ:{ fr:'Minsk',          en:'Minsk',          ru:'Минск' },
    KBP:{ fr:'Kiev',           en:'Kyiv',           ru:'Киев' },
    // Moyen-Orient
    DXB:{ fr:'Dubaï',          en:'Dubai',          ru:'Дубай' },
    AUH:{ fr:'Abu Dhabi',      en:'Abu Dhabi',      ru:'Абу-Даби' },
    DOH:{ fr:'Doha',           en:'Doha',           ru:'Доха' },
    RUH:{ fr:'Riyad',          en:'Riyadh',         ru:'Эр-Рияд' },
    IST:{ fr:'Istanbul',       en:'Istanbul',       ru:'Стамбул' },
    SAW:{ fr:'Istanbul Sabiha',en:'Istanbul Sabiha',ru:'Стамбул Сабиха' },
    BEY:{ fr:'Beyrouth',       en:'Beirut',         ru:'Бейрут' },
    AMM:{ fr:'Amman',          en:'Amman',          ru:'Амман' },
    TLV:{ fr:'Tel Aviv',       en:'Tel Aviv',       ru:'Тель-Авив' },
    MCT:{ fr:'Mascate',        en:'Muscat',         ru:'Маскат' },
    // Afrique
    ABJ:{ fr:'Abidjan',        en:'Abidjan',        ru:'Абиджан' },
    DSS:{ fr:'Dakar',          en:'Dakar',          ru:'Дакар' },
    LFW:{ fr:'Lomé',           en:'Lomé',           ru:'Ломе' },
    CMN:{ fr:'Casablanca',     en:'Casablanca',     ru:'Касабланка' },
    TUN:{ fr:'Tunis',          en:'Tunis',          ru:'Тунис' },
    ALG:{ fr:'Alger',          en:'Algiers',        ru:'Алжир' },
    CAI:{ fr:'Le Caire',       en:'Cairo',          ru:'Каир' },
    LOS:{ fr:'Lagos',          en:'Lagos',          ru:'Лагос' },
    ACC:{ fr:'Accra',          en:'Accra',          ru:'Аккра' },
    NBO:{ fr:'Nairobi',        en:'Nairobi',        ru:'Найроби' },
    JNB:{ fr:'Johannesburg',   en:'Johannesburg',   ru:'Йоханнесбург' },
    DLA:{ fr:'Douala',         en:'Douala',         ru:'Дуала' },
    NSI:{ fr:'Yaoundé',        en:'Yaounde',        ru:'Яунде' },
    COO:{ fr:'Cotonou',        en:'Cotonou',        ru:'Котону' },
    BKO:{ fr:'Bamako',         en:'Bamako',         ru:'Бамако' },
    OUA:{ fr:'Ouagadougou',    en:'Ouagadougou',    ru:'Уагадугу' },
    ADD:{ fr:'Addis-Abeba',    en:'Addis Ababa',    ru:'Аддис-Абеба' },
    TNR:{ fr:'Antananarivo',   en:'Antananarivo',   ru:'Антананариву' },
    MRU:{ fr:'Île Maurice',    en:'Mauritius',      ru:'Маврикий' },
    // Asie
    BKK:{ fr:'Bangkok',        en:'Bangkok',        ru:'Бангкок' },
    DMK:{ fr:'Bangkok Don Mueang',en:'Bangkok Don Mueang',ru:'Бангкок Дон Мыанг' },
    HND:{ fr:'Tokyo',          en:'Tokyo',          ru:'Токио' },
    NRT:{ fr:'Tokyo Narita',   en:'Tokyo Narita',   ru:'Токио Нарита' },
    ICN:{ fr:'Séoul',          en:'Seoul',          ru:'Сеул' },
    SIN:{ fr:'Singapour',      en:'Singapore',      ru:'Сингапур' },
    KUL:{ fr:'Kuala Lumpur',   en:'Kuala Lumpur',   ru:'Куала-Лумпур' },
    CGK:{ fr:'Jakarta',        en:'Jakarta',        ru:'Джакарта' },
    DPS:{ fr:'Bali',           en:'Bali',           ru:'Бали' },
    MNL:{ fr:'Manille',        en:'Manila',         ru:'Манила' },
    SGN:{ fr:'Ho Chi Minh',    en:'Ho Chi Minh',    ru:'Хошимин' },
    HAN:{ fr:'Hanoï',          en:'Hanoi',          ru:'Ханой' },
    BOM:{ fr:'Mumbai',         en:'Mumbai',         ru:'Мумбаи' },
    DEL:{ fr:'Delhi',          en:'Delhi',          ru:'Дели' },
    PEK:{ fr:'Pékin',          en:'Beijing',        ru:'Пекин' },
    PVG:{ fr:'Shanghai',       en:'Shanghai',       ru:'Шанхай' },
    HKG:{ fr:'Hong Kong',      en:'Hong Kong',      ru:'Гонконг' },
    TPE:{ fr:'Taipei',         en:'Taipei',         ru:'Тайбэй' },
    // Amériques
    JFK:{ fr:'New York',       en:'New York',       ru:'Нью-Йорк' },
    EWR:{ fr:'New York Newark',en:'New York Newark',ru:'Нью-Йорк Ньюарк' },
    MIA:{ fr:'Miami',          en:'Miami',          ru:'Майами' },
    LAX:{ fr:'Los Angeles',    en:'Los Angeles',    ru:'Лос-Анджелес' },
    ORD:{ fr:'Chicago',        en:'Chicago',        ru:'Чикаго' },
    YUL:{ fr:'Montréal',       en:'Montreal',       ru:'Монреаль' },
    YYZ:{ fr:'Toronto',        en:'Toronto',        ru:'Торонто' },
    GRU:{ fr:'São Paulo',      en:'Sao Paulo',      ru:'Сан-Паулу' },
    EZE:{ fr:'Buenos Aires',   en:'Buenos Aires',   ru:'Буэнос-Айрес' },
    LIM:{ fr:'Lima',           en:'Lima',           ru:'Лима' },
    BOG:{ fr:'Bogota',         en:'Bogota',         ru:'Богота' },
    // Destinations touristiques
    MLE:{ fr:'Maldives',       en:'Maldives',       ru:'Мальдивы' },
    SEZ:{ fr:'Seychelles',     en:'Seychelles',     ru:'Сейшелы' },
    ZNZ:{ fr:'Zanzibar',       en:'Zanzibar',       ru:'Занзибар' },
    HKT:{ fr:'Phuket',         en:'Phuket',         ru:'Пхукет' },
    USM:{ fr:'Koh Samui',      en:'Koh Samui',      ru:'Ко Самуи' },
    CUN:{ fr:'Cancún',         en:'Cancun',         ru:'Канкун' },
    HAV:{ fr:'La Havane',      en:'Havana',         ru:'Гавана' },
    PUJ:{ fr:'Punta Cana',     en:'Punta Cana',     ru:'Пунта-Кана' },
    TFS:{ fr:'Tenerife',       en:'Tenerife',       ru:'Тенерифе' },
    JTR:{ fr:'Santorin',       en:'Santorini',      ru:'Санторини' },
    HER:{ fr:'Crète',          en:'Crete',          ru:'Крит' },
    PMI:{ fr:'Majorque',       en:'Mallorca',       ru:'Майорка' },
    IBZ:{ fr:'Ibiza',          en:'Ibiza',          ru:'Ибица' },
    MLA:{ fr:'Malte',          en:'Malta',          ru:'Мальта' },
    // Océanie
    SYD:{ fr:'Sydney',         en:'Sydney',         ru:'Сидней' },
    MEL:{ fr:'Melbourne',      en:'Melbourne',      ru:'Мельбурн' },
    AKL:{ fr:'Auckland',       en:'Auckland',       ru:'Окленд' },
};

// ── Recherche d'une query dans toutes les langues → IATA ──
// Retourne array de { iata, displayName, country }
function searchByLang(query, lang){
    const nq = normalize(query);
    const results = [];
    const seen = new Set();

    // 1. Cherche dans CITY_NAMES — supporte FR, EN, RU nativement
    for(const [iata, names] of Object.entries(CITY_NAMES)){
        if(seen.has(iata)) continue;
        const fr = normalize(names.fr);
        const en = normalize(names.en);
        const ru = normalize(names.ru||'');

        const matches = fr.startsWith(nq) || en.startsWith(nq) || ru.startsWith(nq)
                     || fr.includes(nq)   || en.includes(nq)   || ru.includes(nq);
        if(matches){
            // Afficher dans la langue demandée
            const displayName = lang==='ru' ? names.ru
                              : lang==='en' ? names.en
                              : names.fr;
            results.push({ iata, city: displayName, country: '', flag: '' });
            seen.add(iata);
        }
    }

    // 2. Fallback airports.json pour les villes non listées
    const airports = loadAirports();
    for(const a of airports){
        if(seen.has(a.iata)||!a.iata||!a.city) continue;
        const city = normalize(a.city);
        if(city.startsWith(nq) || city.includes(nq)){
            results.push({
                iata:    a.iata,
                city:    a.city,
                country: a.country||'',
                flag:    a.flag||''
            });
            seen.add(a.iata);
        }
        if(results.length >= 20) break;
    }

    return results.slice(0, 8);
}

module.exports = function handler(req, res){
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
    if(req.method==='OPTIONS') return res.status(200).end();

    const ip = req.headers['x-forwarded-for']?.split(',')[0]||'unknown';
    if(!cityRateLimit(ip)) return res.status(429).json({locations:[]});

    const q    = req.query.q;
    const lang = ['fr','en','ru'].includes(req.query.lang) ? req.query.lang : 'fr';

    if(!q||typeof q!=='string'||q.trim().length<1||q.length>50){
        return res.status(200).json({locations:[]});
    }

    const locations = searchByLang(q.trim(), lang);
    return res.status(200).json({ locations });
};
