import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Per-country basic facts (capital / population / surface area / languages),
// keyed by ISO-3 under short keys { cap, pop, area, lang }. BUNDLED at build
// time from world-countries + country-json (see scripts/build-country-facts.mjs).
// Möbius mini-apps compile to a SINGLE file at install — esbuild runs on this
// index.jsx alone with only importmap deps external, so relative/sibling
// imports (e.g. ./country-facts.json) cannot resolve and the install fails with
// "Could not resolve". The data therefore lives INLINE here as a const, not as
// a sibling import: it ships inside app-<id>.js, always present, fully offline,
// no storage round-trip, and no external API (Atlas runs under CSP
// connect-src 'self'). country-facts.json + scripts/build-country-facts.mjs
// stay in the repo as the regeneration source; `npm run build:facts` rewrites
// the const below between the BEGIN/END markers, keeping the app single-file.
// COUNTRY_FACTS:BEGIN (generated — do not edit by hand; run `npm run build:facts`)
const COUNTRY_FACTS = {"AFG":{"cap":"Kabul","pop":37172386,"area":652230,"lang":["Dari","Pashto","Turkmen"]},"ALB":{"cap":"Tirana","pop":2866376,"area":28748,"lang":["Albanian"]},"DZA":{"cap":"Algiers","pop":42228429,"area":2381741,"lang":["Arabic"]},"AND":{"cap":"Andorra la Vella","pop":77006,"area":468,"lang":["Catalan"]},"AGO":{"cap":"Luanda","pop":30809762,"area":1246700,"lang":["Portuguese"]},"ATG":{"cap":"Saint John's","pop":96286,"area":442,"lang":["English"]},"ARG":{"cap":"Buenos Aires","pop":44494502,"area":2780400,"lang":["Guaraní","Spanish"]},"ARM":{"cap":"Yerevan","pop":2951776,"area":29743,"lang":["Armenian"]},"AUS":{"cap":"Canberra","pop":24982688,"area":7692024,"lang":["English"]},"AUT":{"cap":"Vienna","pop":8840521,"area":83871,"lang":["Austro-Bavarian German"]},"AZE":{"cap":"Baku","pop":9939800,"area":86600,"lang":["Azerbaijani","Russian"]},"BHS":{"cap":"Nassau","pop":385640,"area":13943,"lang":["English"]},"BHR":{"cap":"Manama","pop":1569439,"area":765,"lang":["Arabic"]},"BGD":{"cap":"Dhaka","pop":161356039,"area":147570,"lang":["Bengali"]},"BRB":{"cap":"Bridgetown","pop":286641,"area":430,"lang":["English"]},"BLR":{"cap":"Minsk","pop":9483499,"area":207600,"lang":["Belarusian","Russian"]},"BEL":{"cap":"Brussels","pop":11433256,"area":30528,"lang":["German","French","Dutch"]},"BLZ":{"cap":"Belmopan","pop":383071,"area":22966,"lang":["Belizean Creole","English","Spanish"]},"BEN":{"cap":"Porto-Novo","pop":11485048,"area":112622,"lang":["French"]},"BTN":{"cap":"Thimphu","pop":754394,"area":38394,"lang":["Dzongkha"]},"BOL":{"cap":"Sucre","pop":11353142,"area":1098581,"lang":["Aymara","Guaraní","Quechua","Spanish"]},"BIH":{"cap":"Sarajevo","pop":3323929,"area":51209,"lang":["Bosnian","Croatian","Serbian"]},"BWA":{"cap":"Gaborone","pop":2254126,"area":582000,"lang":["English","Tswana"]},"BRA":{"cap":"Brasília","pop":209469333,"area":8515767,"lang":["Portuguese"]},"BRN":{"cap":"Bandar Seri Begawan","pop":428962,"area":5765,"lang":["Malay"]},"BGR":{"cap":"Sofia","pop":7025037,"area":110879,"lang":["Bulgarian"]},"BFA":{"cap":"Ouagadougou","pop":19751535,"area":272967,"lang":["French"]},"BDI":{"cap":"Gitega","pop":11175378,"area":27834,"lang":["French","Kirundi"]},"CPV":{"cap":"Praia","pop":543767,"area":4033,"lang":["Portuguese"]},"KHM":{"cap":"Phnom Penh","pop":16249798,"area":181035,"lang":["Khmer"]},"CMR":{"cap":"Yaoundé","pop":25216237,"area":475442,"lang":["English","French"]},"CAN":{"cap":"Ottawa","pop":37057765,"area":9984670,"lang":["English","French"]},"CAF":{"cap":"Bangui","pop":4666377,"area":622984,"lang":["French","Sango"]},"TCD":{"cap":"N'Djamena","pop":15477751,"area":1284000,"lang":["Arabic","French"]},"CHL":{"cap":"Santiago","pop":18729160,"area":756102,"lang":["Spanish"]},"CHN":{"cap":"Beijing","pop":1392730000,"area":9706961,"lang":["Chinese"]},"COL":{"cap":"Bogotá","pop":49648685,"area":1141748,"lang":["Spanish"]},"COM":{"cap":"Moroni","pop":832322,"area":1862,"lang":["Arabic","French","Comorian"]},"COG":{"cap":"Brazzaville","pop":5244363,"area":342000,"lang":["French","Kikongo","Lingala"]},"COD":{"cap":"Kinshasa","pop":84068091,"area":2344858,"lang":["French","Kikongo","Lingala","Tshiluba","Swahili"]},"CRI":{"cap":"San José","pop":4999441,"area":51100,"lang":["Spanish"]},"CIV":{"cap":"Yamoussoukro","pop":25069229,"area":322463,"lang":["French"]},"HRV":{"cap":"Zagreb","pop":4087843,"area":56594,"lang":["Croatian"]},"CUB":{"cap":"Havana","pop":11338138,"area":109884,"lang":["Spanish"]},"CYP":{"cap":"Nicosia","pop":1189265,"area":9251,"lang":["Greek","Turkish"]},"CZE":{"cap":"Prague","pop":10629928,"area":78865,"lang":["Czech","Slovak"]},"DNK":{"cap":"Copenhagen","pop":5793636,"area":43094,"lang":["Danish"]},"DJI":{"cap":"Djibouti","pop":958920,"area":23200,"lang":["Arabic","French"]},"DMA":{"cap":"Roseau","pop":71625,"area":751,"lang":["English"]},"DOM":{"cap":"Santo Domingo","pop":10627165,"area":48671,"lang":["Spanish"]},"ECU":{"cap":"Quito","pop":17084357,"area":276841,"lang":["Spanish"]},"EGY":{"cap":"Cairo","pop":98423595,"area":1002450,"lang":["Arabic"]},"SLV":{"cap":"San Salvador","pop":6420744,"area":21041,"lang":["Spanish"]},"GNQ":{"cap":"Malabo","pop":1308974,"area":28051,"lang":["French","Portuguese","Spanish"]},"ERI":{"cap":"Asmara","pop":6213972,"area":117600,"lang":["Arabic","English","Tigrinya"]},"EST":{"cap":"Tallinn","pop":1321977,"area":45227,"lang":["Estonian"]},"SWZ":{"cap":"Lobamba","pop":1136191,"area":17364,"lang":["English","Swazi"]},"ETH":{"cap":"Addis Ababa","pop":109224559,"area":1104300,"lang":["Amharic"]},"FJI":{"cap":"Suva","pop":883483,"area":18272,"lang":["English","Fijian","Fiji Hindi"]},"FIN":{"cap":"Helsinki","pop":5515525,"area":338424,"lang":["Finnish","Swedish"]},"FRA":{"cap":"Paris","pop":66977107,"area":551695,"lang":["French"]},"GAB":{"cap":"Libreville","pop":2119275,"area":267668,"lang":["French"]},"GMB":{"cap":"Banjul","pop":2280102,"area":10689,"lang":["English"]},"GEO":{"cap":"Tbilisi","pop":3726549,"area":69700,"lang":["Georgian"]},"DEU":{"cap":"Berlin","pop":82905782,"area":357114,"lang":["German"]},"GHA":{"cap":"Accra","pop":29767108,"area":238533,"lang":["English"]},"GRC":{"cap":"Athens","pop":10731726,"area":131990,"lang":["Greek"]},"GRD":{"cap":"St. George's","pop":111454,"area":344,"lang":["English"]},"GTM":{"cap":"Guatemala City","pop":17247807,"area":108889,"lang":["Spanish"]},"GIN":{"cap":"Conakry","pop":12414318,"area":245857,"lang":["French"]},"GNB":{"cap":"Bissau","pop":1874309,"area":36125,"lang":["Portuguese","Upper Guinea Creole"]},"GUY":{"cap":"Georgetown","pop":779004,"area":214969,"lang":["English"]},"HTI":{"cap":"Port-au-Prince","pop":11123176,"area":27750,"lang":["French","Haitian Creole"]},"VAT":{"cap":"Vatican City","pop":825,"area":0.44,"lang":["Italian","Latin"]},"HND":{"cap":"Tegucigalpa","pop":9587522,"area":112492,"lang":["Spanish"]},"HUN":{"cap":"Budapest","pop":9775564,"area":93028,"lang":["Hungarian"]},"ISL":{"cap":"Reykjavik","pop":352721,"area":103000,"lang":["Icelandic"]},"IND":{"cap":"New Delhi","pop":1352617328,"area":3287590,"lang":["English","Hindi","Tamil"]},"IDN":{"cap":"Jakarta","pop":267663435,"area":1904569,"lang":["Indonesian"]},"IRN":{"cap":"Tehran","pop":81800269,"area":1648195,"lang":["Persian (Farsi)"]},"IRQ":{"cap":"Baghdad","pop":38433600,"area":438317,"lang":["Arabic","Aramaic","Sorani"]},"IRL":{"cap":"Dublin","pop":4867309,"area":70273,"lang":["English","Irish"]},"ISR":{"cap":"Jerusalem","pop":8882800,"area":20770,"lang":["Arabic","Hebrew"]},"ITA":{"cap":"Rome","pop":60421760,"area":301336,"lang":["Italian"]},"JAM":{"cap":"Kingston","pop":2934855,"area":10991,"lang":["English","Jamaican Patois"]},"JPN":{"cap":"Tokyo","pop":126529100,"area":377930,"lang":["Japanese"]},"JOR":{"cap":"Amman","pop":9956011,"area":89342,"lang":["Arabic"]},"KAZ":{"cap":"Astana","pop":18272430,"area":2724900,"lang":["Kazakh","Russian"]},"KEN":{"cap":"Nairobi","pop":51393010,"area":580367,"lang":["English","Swahili"]},"KIR":{"cap":"South Tarawa","pop":115847,"area":811,"lang":["English","Gilbertese"]},"PRK":{"cap":"Pyongyang","pop":25549819,"area":120538,"lang":["Korean"]},"KOR":{"cap":"Seoul","pop":51606633,"area":100210,"lang":["Korean"]},"KWT":{"cap":"Kuwait City","pop":4137309,"area":17818,"lang":["Arabic"]},"KGZ":{"cap":"Bishkek","pop":6322800,"area":199951,"lang":["Kyrgyz","Russian"]},"LAO":{"cap":"Vientiane","pop":7061507,"area":236800,"lang":["Lao"]},"LVA":{"cap":"Riga","pop":1927174,"area":64559,"lang":["Latvian"]},"LBN":{"cap":"Beirut","pop":6848925,"area":10452,"lang":["Arabic","French"]},"LSO":{"cap":"Maseru","pop":2108132,"area":30355,"lang":["English","Sotho"]},"LBR":{"cap":"Monrovia","pop":4818977,"area":111369,"lang":["English"]},"LBY":{"cap":"Tripoli","pop":6678567,"area":1759540,"lang":["Arabic"]},"LIE":{"cap":"Vaduz","pop":37910,"area":160,"lang":["German"]},"LTU":{"cap":"Vilnius","pop":2801543,"area":65300,"lang":["Lithuanian"]},"LUX":{"cap":"Luxembourg","pop":607950,"area":2586,"lang":["German","French","Luxembourgish"]},"MDG":{"cap":"Antananarivo","pop":26262368,"area":587041,"lang":["French","Malagasy"]},"MWI":{"cap":"Lilongwe","pop":18143315,"area":118484,"lang":["English","Chewa"]},"MYS":{"cap":"Kuala Lumpur","pop":31528585,"area":330803,"lang":["English","Malay"]},"MDV":{"cap":"Malé","pop":515696,"area":300,"lang":["Maldivian"]},"MLI":{"cap":"Bamako","pop":19077690,"area":1240192,"lang":["French"]},"MLT":{"cap":"Valletta","pop":484630,"area":316,"lang":["English","Maltese"]},"MHL":{"cap":"Majuro","pop":58413,"area":181,"lang":["English","Marshallese"]},"MRT":{"cap":"Nouakchott","pop":4403319,"area":1030700,"lang":["Arabic"]},"MUS":{"cap":"Port Louis","pop":1265303,"area":2040,"lang":["English","French","Mauritian Creole"]},"MEX":{"cap":"Mexico City","pop":126190788,"area":1964375,"lang":["Spanish"]},"FSM":{"cap":"Palikir","pop":112640,"area":702,"lang":["English"]},"MDA":{"cap":"Chișinău","pop":2706049,"area":33846,"lang":["Moldavian"]},"MCO":{"cap":"Monaco","pop":38682,"area":2.02,"lang":["French"]},"MNG":{"cap":"Ulan Bator","pop":3170208,"area":1564110,"lang":["Mongolian"]},"MNE":{"cap":"Podgorica","pop":631219,"area":13812,"lang":["Montenegrin"]},"MAR":{"cap":"Rabat","pop":36029138,"area":446550,"lang":["Arabic","Berber"]},"MOZ":{"cap":"Maputo","pop":29495962,"area":801590,"lang":["Portuguese"]},"MMR":{"cap":"Naypyidaw","pop":53708395,"area":676578,"lang":["Burmese"]},"NAM":{"cap":"Windhoek","pop":2448255,"area":825615,"lang":["Afrikaans","German","English","Herero","Khoekhoe","Kwangali","Lozi","Ndonga","Tswana"]},"NRU":{"cap":"Yaren","pop":12704,"area":21,"lang":["English","Nauru"]},"NPL":{"cap":"Kathmandu","pop":28087871,"area":147181,"lang":["Nepali"]},"NLD":{"cap":"Amsterdam","pop":17231624,"area":41850,"lang":["Dutch"]},"NZL":{"cap":"Wellington","pop":4841000,"area":270467,"lang":["English","Māori","New Zealand Sign Language"]},"NIC":{"cap":"Managua","pop":6465513,"area":130373,"lang":["Spanish"]},"NER":{"cap":"Niamey","pop":22442948,"area":1267000,"lang":["French"]},"NGA":{"cap":"Abuja","pop":195874740,"area":923768,"lang":["English"]},"MKD":{"cap":"Skopje","pop":2084367,"area":25713,"lang":["Macedonian"]},"NOR":{"cap":"Oslo","pop":5311916,"area":323802,"lang":["Norwegian Nynorsk","Norwegian Bokmål","Sami"]},"OMN":{"cap":"Muscat","pop":4829483,"area":309500,"lang":["Arabic"]},"PAK":{"cap":"Islamabad","pop":212215030,"area":881912,"lang":["English","Urdu"]},"PLW":{"cap":"Ngerulmud","pop":17907,"area":459,"lang":["English","Palauan"]},"PSE":{"cap":"Ramallah","pop":4569087,"area":6220,"lang":["Arabic"]},"PAN":{"cap":"Panama City","pop":4176873,"area":75417,"lang":["Spanish"]},"PNG":{"cap":"Port Moresby","pop":8606316,"area":462840,"lang":["English","Hiri Motu","Tok Pisin"]},"PRY":{"cap":"Asunción","pop":6956071,"area":406752,"lang":["Guaraní","Spanish"]},"PER":{"cap":"Lima","pop":31989256,"area":1285216,"lang":["Aymara","Quechua","Spanish"]},"PHL":{"cap":"Manila","pop":106651922,"area":342353,"lang":["English","Filipino"]},"POL":{"cap":"Warsaw","pop":37974750,"area":312679,"lang":["Polish"]},"PRT":{"cap":"Lisbon","pop":10283822,"area":92090,"lang":["Portuguese"]},"QAT":{"cap":"Doha","pop":2781677,"area":11586,"lang":["Arabic"]},"ROU":{"cap":"Bucharest","pop":19466145,"area":238391,"lang":["Romanian"]},"RUS":{"cap":"Moscow","pop":144478050,"area":17098242,"lang":["Russian"]},"RWA":{"cap":"Kigali","pop":12301939,"area":26338,"lang":["English","French","Kinyarwanda"]},"KNA":{"cap":"Basseterre","pop":52441,"area":261,"lang":["English"]},"LCA":{"cap":"Castries","pop":181889,"area":616,"lang":["English"]},"VCT":{"cap":"Kingstown","pop":110210,"area":389,"lang":["English"]},"WSM":{"cap":"Apia","pop":196130,"area":2842,"lang":["English","Samoan"]},"SMR":{"cap":"City of San Marino","pop":33785,"area":61,"lang":["Italian"]},"STP":{"cap":"São Tomé","pop":211028,"area":964,"lang":["Portuguese"]},"SAU":{"cap":"Riyadh","pop":33699947,"area":2149690,"lang":["Arabic"]},"SEN":{"cap":"Dakar","pop":15854360,"area":196722,"lang":["French"]},"SRB":{"cap":"Belgrade","pop":6963764,"area":88361,"lang":["Serbian"]},"SYC":{"cap":"Victoria","pop":96762,"area":452,"lang":["Seychellois Creole","English","French"]},"SLE":{"cap":"Freetown","pop":7650154,"area":71740,"lang":["English"]},"SGP":{"cap":"Singapore","pop":5638676,"area":710,"lang":["English","Malay","Tamil","Chinese"]},"SVK":{"cap":"Bratislava","pop":5446771,"area":49037,"lang":["Slovak"]},"SVN":{"cap":"Ljubljana","pop":2073894,"area":20273,"lang":["Slovene"]},"SLB":{"cap":"Honiara","pop":652858,"area":28896,"lang":["English"]},"SOM":{"cap":"Mogadishu","pop":15008154,"area":637657,"lang":["Arabic","Somali"]},"ZAF":{"cap":"Pretoria","pop":57779622,"area":1221037,"lang":["Afrikaans","English","Southern Ndebele","Northern Sotho","Southern Sotho","Swazi","Tswana","Tsonga","Venda","Xhosa","Zulu"]},"SSD":{"cap":"Juba","pop":10975920,"area":619745,"lang":["English"]},"ESP":{"cap":"Madrid","pop":46796540,"area":505992,"lang":["Spanish"]},"LKA":{"cap":"Colombo","pop":21670000,"area":65610,"lang":["Sinhala","Tamil"]},"SDN":{"cap":"Khartoum","pop":41801533,"area":1886068,"lang":["Arabic","English"]},"SUR":{"cap":"Paramaribo","pop":575991,"area":163820,"lang":["Dutch"]},"SWE":{"cap":"Stockholm","pop":10175214,"area":450295,"lang":["Swedish"]},"CHE":{"cap":"Bern","pop":8513227,"area":41284,"lang":["French","Swiss German","Italian","Romansh"]},"SYR":{"cap":"Damascus","pop":16906283,"area":185180,"lang":["Arabic"]},"TJK":{"cap":"Dushanbe","pop":9100837,"area":143100,"lang":["Russian","Tajik"]},"TZA":{"cap":"Dodoma","pop":56318348,"area":945087,"lang":["English","Swahili"]},"THA":{"cap":"Bangkok","pop":69428524,"area":513120,"lang":["Thai"]},"TLS":{"cap":"Dili","pop":1267972,"area":14874,"lang":["Portuguese","Tetum"]},"TGO":{"cap":"Lomé","pop":7889094,"area":56785,"lang":["French"]},"TON":{"cap":"Nuku'alofa","pop":103197,"area":747,"lang":["English","Tongan"]},"TTO":{"cap":"Port of Spain","pop":1389858,"area":5130,"lang":["English"]},"TUN":{"cap":"Tunis","pop":11565204,"area":163610,"lang":["Arabic"]},"TUR":{"cap":"Ankara","pop":82319724,"area":783562,"lang":["Turkish"]},"TKM":{"cap":"Ashgabat","pop":5850908,"area":488100,"lang":["Russian","Turkmen"]},"TUV":{"cap":"Funafuti","pop":11508,"area":26,"lang":["English","Tuvaluan"]},"UGA":{"cap":"Kampala","pop":42723139,"area":241550,"lang":["English","Swahili"]},"UKR":{"cap":"Kyiv","pop":44622516,"area":603500,"lang":["Ukrainian"]},"ARE":{"cap":"Abu Dhabi","pop":9630959,"area":83600,"lang":["Arabic"]},"GBR":{"cap":"London","pop":66460344,"area":242900,"lang":["English"]},"USA":{"cap":"Washington D.C.","pop":326687501,"area":9372610,"lang":["English"]},"URY":{"cap":"Montevideo","pop":3449299,"area":181034,"lang":["Spanish"]},"UZB":{"cap":"Tashkent","pop":32955400,"area":447400,"lang":["Russian","Uzbek"]},"VUT":{"cap":"Port Vila","pop":292680,"area":12189,"lang":["Bislama","English","French"]},"VEN":{"cap":"Caracas","pop":28870195,"area":916445,"lang":["Spanish"]},"VNM":{"cap":"Hanoi","pop":95540395,"area":331212,"lang":["Vietnamese"]},"YEM":{"cap":"Sana'a","pop":28498687,"area":527968,"lang":["Arabic"]},"ZMB":{"cap":"Lusaka","pop":17351822,"area":752612,"lang":["English"]},"ZWE":{"cap":"Harare","pop":14439018,"area":390757,"lang":["Chibarwe","English","Kalanga","Khoisan","Ndau","Northern Ndebele","Chewa","Shona","Sotho","Tonga","Tswana","Tsonga","Venda","Xhosa","Zimbabwean Sign Language"]}}
// COUNTRY_FACTS:END

// --------------------------------------------------------------------------
// Storage shim — probe runtime on every call, fall back to fetch on miss.
// --------------------------------------------------------------------------
// The Möbius offline runtime exposes window.mobius.storage. It can be
// injected AFTER the app boots (the shell installs it post-mount on some
// paths), so caching `native` at construction time wedges every later call
// into the direct-fetch path even when the runtime is alive. Other apps
// (app-gym, notes, habits) all probe at call time — we follow that pattern.
//
// Each method also falls back to fetch when the runtime is present but
// throws — a single bad runtime call shouldn't poison the rest of the
// session.
function makeStorage({ appId, token }) {
  const auth = { Authorization: `Bearer ${token}` }
  const base = `/api/storage/apps/${appId}`

  const probe = () =>
    (typeof window !== 'undefined' && window.mobius?.storage) || null

  async function get(path) {
    const native = probe()
    if (native && typeof native.get === 'function') {
      try {
        return await native.get(path)
      } catch {
        // fall through to fetch — better a stale-but-real read than null
      }
    }
    try {
      const r = await fetch(`${base}/${path}`, { headers: auth })
      if (r.status === 404) return null
      if (!r.ok) return null
      const text = await r.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    } catch {
      return null
    }
  }

  async function set(path, data) {
    const native = probe()
    if (native && typeof native.set === 'function') {
      try {
        return await native.set(path, data)
      } catch {
        // fall through to direct PUT
      }
    }
    const r = await fetch(`${base}/${path}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!r.ok) throw new Error(`storage set ${path}: ${r.status}`)
    return { synced: true }
  }

  // pendingCount surfaces the runtime outbox depth. Returns 0 when there
  // is no runtime (no outbox to surface).
  async function pendingCount() {
    const native = probe()
    if (native && typeof native.pendingCount === 'function') {
      try {
        return await native.pendingCount()
      } catch {
        return 0
      }
    }
    return 0
  }

  // hasRuntime is a *probe*, not a cached boolean — readers call it when
  // they need a fresh answer (the SyncPill uses it on every render).
  function hasRuntime() {
    return !!probe()
  }

  return { get, set, pendingCount, hasRuntime }
}

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------
const soften = (value) => String(value || '').toLowerCase().trim()
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// Hero sayings — the short line beside the brand mark. ONE is picked at random
// on mount and stays fixed for the whole session: it does NOT cycle while the
// app is open (a line that re-rolled under the user's eyes read as a glitch).
// Re-open the app for a fresh pick. This is the ONLY editable copy surface.
//
// CONSTRAINT — every line must fit the header on one line at a phone width with
// NO ellipsis. The saying shares the top bar with the brand icon and the
// visited counter, so its box is narrow (~190px at 360px wide, narrower as the
// counter widens). These six were measured to fit at 360–412px against the
// widest counter; keep new lines ≤ ~24 characters (scrollWidth ≤ ~178px) or
// they truncate. EMPTY THE ARRAY to render no line at all — the header simply
// omits it, so clearing this list cleanly removes the hero copy.
const ROTATING_SAYINGS = [
  'The world is your oyster.',
  'Adventure is out there.',
  'Go see for yourself.',
  'The world is yours.',
  'Collect places.',
  'Wander often.',
]

// Pick the saying index at random WITHOUT repeating the one on screen.
// Returns -1 when the list is empty (the caller renders nothing) and stays put
// when the list has a single entry (no other choice). `random` is injected so
// the pick is unit-testable; it defaults to Math.random in the app. The app
// calls this ONCE on mount (no interval) so the line is fixed per app-open.
export function pickRotatingSaying(sayings, currentIndex, random = Math.random) {
  if (!Array.isArray(sayings) || sayings.length === 0) return -1
  if (sayings.length === 1) return 0
  let next = Math.floor(random() * sayings.length)
  if (next >= sayings.length) next = sayings.length - 1 // guard random()===1
  // Avoid a back-to-back repeat: step one forward and wrap.
  if (next === currentIndex) next = (next + 1) % sayings.length
  return next
}

// Versor (unit-quaternion) helpers for "grab the surface" dragging. A fixed
// deg/px drag can't track the surface: on an orthographic globe the same
// finger travel sweeps a different angle depending on zoom, viewport size,
// and where on the sphere you grabbed (the limb foreshortens). Versor maths
// solves the rotation that carries the point first grabbed to the point now
// under the pointer, so the surface stays glued to the finger everywhere.
// Ported from Mike Bostock's `versor` (ISC) — kept inline so the app needs no
// extra runtime dep beyond d3-geo (which is already gated for offline).
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
// [lng, lat]° → unit vector on the sphere.
const versorCartesian = (e) => {
  const l = e[0] * DEG2RAD
  const p = e[1] * DEG2RAD
  const cp = Math.cos(p)
  return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]
}
// Euler rotation [λ, φ, γ]° → quaternion.
const versorFromAngles = (e) => {
  const l = (e[0] / 2) * DEG2RAD
  const sl = Math.sin(l)
  const cl = Math.cos(l)
  const p = (e[1] / 2) * DEG2RAD
  const sp = Math.sin(p)
  const cp = Math.cos(p)
  const g = (e[2] / 2) * DEG2RAD
  const sg = Math.sin(g)
  const cg = Math.cos(g)
  return [
    cl * cp * cg + sl * sp * sg,
    sl * cp * cg - cl * sp * sg,
    cl * sp * cg + sl * cp * sg,
    cl * cp * sg - sl * sp * cg,
  ]
}
// Quaternion → Euler rotation [λ, φ, γ]°.
const versorToAngles = (q) => [
  Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * RAD2DEG,
  Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * RAD2DEG,
  Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * RAD2DEG,
]
// Quaternion of the shortest rotation carrying unit vector v0 → v1.
const versorDelta = (v0, v1) => {
  const w = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ]
  const l = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2])
  if (!l) return [1, 0, 0, 0]
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]
  const t = Math.acos(Math.max(-1, Math.min(1, dot))) / 2
  const s = Math.sin(t)
  return [Math.cos(t), (w[2] / l) * s, (-w[1] / l) * s, (w[0] / l) * s]
}
// Hamilton product q0·q1 (compose two rotations).
const versorMultiply = (q0, q1) => [
  q0[0] * q1[0] - q0[1] * q1[1] - q0[2] * q1[2] - q0[3] * q1[3],
  q0[0] * q1[1] + q0[1] * q1[0] + q0[2] * q1[3] - q0[3] * q1[2],
  q0[0] * q1[2] - q0[1] * q1[3] + q0[2] * q1[0] + q0[3] * q1[1],
  q0[0] * q1[3] + q0[1] * q1[2] - q0[2] * q1[1] + q0[3] * q1[0],
]

// Pixel distance between the first two live pointers in a pointer Map. The
// pinch gesture is driven entirely by how this distance changes, so it
// lives in one named place rather than inline in the move handler.
function pinchSpread(pointers) {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

// Initial rotation — Western Europe slightly above the equator. Easier to
// recognize than 0,0 (which puts the user in the Atlantic).
const INITIAL_ROTATION = [12, -22, 0]
// Closest the view-centre is allowed to approach a pole. The globe stays
// north-up (roll = 0), so this is a real ceiling — but it's reached via a
// smooth ease (see softClampLat), not a hard wall.
export const ROTATION_SINGULARITY_LAT = 88
// Below this latitude, dragging is exact 1:1 versor manipulation. Past it we
// ease latitude toward the ceiling and damp longitude (see nextDragRotation).
const POLE_EASE_START = 72

// Zoom — a multiplier on the size-derived base radius (1 = the default
// "fits the canvas" globe). Kept as a multiplier, not an absolute pixel
// scale, so it survives a resize: the bottom sheet dragging up shrinks the
// base radius but the user's chosen zoom level rides along unchanged.
// MIN < 1 lets the user pull back for a fuller sphere; MAX caps the zoom-in
// before country borders turn to mush. To change the zoom range, edit these
// two — every gesture (pinch, wheel, +/- buttons, keyboard) clamps to them.
const MIN_ZOOM = 0.75
const MAX_ZOOM = 6
// Each +/- button press (and keyboard +/-) steps the zoom by this factor.
// 1.4× per step ≈ 5 presses to cross the whole range, which feels like
// "a few taps" rather than a slow crawl.
const ZOOM_STEP = 1.4

// Release inertia — when the finger lifts, the globe keeps spinning with the
// velocity it had and decays by INERTIA_FRICTION each frame (≈0.92 → loses
// ~8%/frame, a natural ~0.4s glide at 60fps). Below INERTIA_MIN_SPEED°/frame
// the motion is imperceptible, so the loop stops. INERTIA_MAX_SPEED caps a
// flick so a fast swipe can't launch the globe into a blur.
const INERTIA_FRICTION = 0.92
const INERTIA_MIN_SPEED = 0.015 // °/frame — below this the glide has visually stopped
const INERTIA_MAX_SPEED = 8 // °/frame — clamp a hard flick to a readable spin
// How many recent move deltas average into the release velocity. Averaging the
// last few (not just the final delta) smooths out a jittery last sample so the
// glide direction matches the swipe the user actually made.
const VELOCITY_SAMPLES = 4

// Total angular distance between two [lng, lat]° points on the sphere, in
// degrees (the great-circle angle). Used by tests to assert a near-edge drag
// produces a bounded rotation (no runaway limb snap).
export const angularStepDeg = (a, b) => {
  const va = versorCartesian(a)
  const vb = versorCartesian(b)
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))
  return Math.acos(dot) * RAD2DEG
}

// Soft-ease the pointer's distance-from-centre toward (but never past) the
// sphere's silhouette before inverting it. THIS is the fix for the owner's
// "I drag the globe but at the left/right boundaries it moves nonlinearly —
// a bit too abrupt." On an orthographic globe the inverse projection maps the
// normalized disc radius ρ∈[0,1] to colatitude asin(ρ); its angular gain
// d(asin ρ)/dρ = 1/√(1−ρ²) DIVERGES at the limb (ρ→1). So the last few percent
// of the disc already sweep a steeply-accelerating angle (gain ≈ 7× at ρ=0.95,
// ≈ 22× at ρ=0.999) — that ramp IS the abruptness. The previous fix HARD-clamped
// ρ to a fixed 0.999 circle: it removed the runaway but introduced two
// discontinuities of its own — the gain still spiked up to the wall, then every
// pointer past it collapsed onto one frozen circle (slope 0 → a dead-zone). A
// hard clamp can't feel smooth because its derivative is discontinuous.
//
// The smooth solution (the feel of travel apps like "Been"): keep the inner
// disc EXACTLY 1:1 versor tracking, then ease ρ with a tanh falloff that
// asymptotes to a sub-limb ceiling. The response stays naturally nonlinear (the
// owner wants nonlinear) but its DERIVATIVE is continuous everywhere — no spike,
// no wall, no freeze — and the inverse gain is bounded (≈ 5.8× max instead of
// 22×+). A pointer dragged far off-disc keeps moving the globe a little further,
// monotonically, instead of jumping or sticking. This mirrors the production
// d3 globe-drag handlers (Fil's d3-inertia and vasturiano's d3-geo-zoom), which
// invert the RAW pointer and simply skip the frame when invert returns NaN
// off-disc — solveVersorDrag keeps that null-and-hold guard as a backstop; the
// ease here is what makes the approach-to-the-edge itself smooth.
// Sources: github.com/d3/versor, observablehq.com/@d3/versor-dragging (Bostock),
// github.com/Fil/d3-inertia (`if (isNaN(inv[0])) return`), d3-geo-zoom.

// Below this fraction of the radius the pointer is inverted unchanged — exact
// 1:1 grab-and-drag tracking through the whole centre of the globe.
const LIMB_EASE_START = 0.88
// The eased radius asymptotes to this fraction of the radius and never reaches
// the singular limb (ρ=1), which keeps the inverse gain bounded and finite.
const LIMB_EASE_CEIL = 0.985
export function easePointerToDisc(px, py, cx, cy, radius) {
  const dx = px - cx
  const dy = py - cy
  const dist = Math.hypot(dx, dy)
  if (!(radius > 0)) return [px, py]
  const rho = dist / radius
  if (!(rho > LIMB_EASE_START)) return [px, py] // inner disc: untouched, 1:1
  // tanh eases the excess radius so the result rises from LIMB_EASE_START toward
  // LIMB_EASE_CEIL, approaching but never crossing it — a continuous,
  // monotone, bounded mapping (no clamp wall, no dead-zone).
  const range = LIMB_EASE_CEIL - LIMB_EASE_START
  const eased = LIMB_EASE_START + range * Math.tanh((rho - LIMB_EASE_START) / range)
  const k = (eased * radius) / dist // dist > 0 here since rho > START ≥ 0
  return [cx + dx * k, cy + dy * k]
}

const isRotationSingular = (rotation) => Math.abs(rotation?.[1] || 0) >= ROTATION_SINGULARITY_LAT
// Smoothly compress latitude near the poles instead of slamming a hard clamp.
// tanh asymptotes toward the ceiling, so the drag *eases* into the pole — no
// wall to fight, no abrupt stop.
const softClampLat = (lat) => {
  const a = Math.abs(lat)
  if (a <= POLE_EASE_START) return lat
  const range = 90 - POLE_EASE_START // headroom above the ease point
  const cap = ROTATION_SINGULARITY_LAT - POLE_EASE_START // how far past it we allow
  const t = (a - POLE_EASE_START) / range // 0 at the ease point, grows past 1
  return Math.sign(lat) * (POLE_EASE_START + cap * Math.tanh(t))
}
// Shortest signed angular delta a→b in degrees, wrapped to (-180, 180].
const shortestLngDelta = (a, b) => ((b - a + 540) % 360) - 180
export const nextDragRotation = (current, lng, lat) => {
  const nextLat = softClampLat(lat)
  const a = Math.abs(nextLat)
  // Near a pole a tiny horizontal drag maps to a huge longitude swing — that's
  // what read as "singular/twitchy". Damp the longitude step (only inside the
  // polar cap, never to zero) so the spin stays calm while the rest of the
  // globe keeps exact grab-and-drag tracking.
  let factor = 1
  if (a > POLE_EASE_START) {
    const t = Math.min(1, (a - POLE_EASE_START) / (90 - POLE_EASE_START))
    factor = 1 - 0.85 * t // eases down to 0.15 at the pole, never fully locked
  }
  const prevLng = current?.[0] ?? 0
  const nextLng = prevLng + shortestLngDelta(prevLng, lng) * factor
  return [nextLng, nextLat, 0]
}

// Solve one frame of versor drag: the rotation that carries the point first
// grabbed (v0, captured at startRotate q0) to the point now under the pointer,
// so the surface stays glued to the finger (Bostock/Davies versor dragging).
// The pointer is first soft-eased inside the silhouette (easePointerToDisc) so
// a near/over-edge pointer can't hit the limb singularity AND the approach to
// the edge stays smooth — that ease is why dragging the boundary no longer
// feels abrupt (the owner's report) and never "goes crazy". `makeProjection`
// builds a d3 orthographic projection for a given rotation (injected so this is
// pure and unit-testable with a real d3-geo but no DOM). Returns the next
// [lng, lat, 0] rotation (north-up: roll is dropped and the pole is soft-
// clamped via nextDragRotation), or null when the gesture should hold the last
// good rotation (grab/here inverted off-sphere, or a pole-crossing roll flip).
export function solveVersorDrag({ makeProjection, startRotate, v0, q0, current, px, py, cx, cy, radius }) {
  if (!v0 || !q0) return null
  const [cpx, cpy] = easePointerToDisc(px, py, cx, cy, radius)
  const here = makeProjection(startRotate).invert([cpx, cpy])
  if (!here || !Number.isFinite(here[0]) || !Number.isFinite(here[1])) return null
  const q = versorMultiply(q0, versorDelta(v0, versorCartesian(here)))
  const [lng, lat, roll] = versorToAngles(q)
  // Past a pole the versor decode folds latitude back down (asin's [-90,90]
  // range) and roll flips toward ±180° — the globe then appears to reverse.
  // A large roll means the drag tried to cross the pole; hold the last good
  // rotation so the vertical drag stays bounded by the N/S poles (the upright
  // feel a country picker wants) instead of flipping past them.
  if (Math.abs(roll) > 90) return null
  // North-up: take the solved longitude/latitude, drop the roll, and soft-clamp
  // the latitude near the poles. Away from the poles this is exact 1:1 versor
  // tracking; the pixel clamp above already bounds the per-frame step (versor's
  // own delta is an acos angle, intrinsically ≤180°), so no separate angle cap
  // is needed — and removing that cap is what stops the freeze-then-jump.
  return nextDragRotation(current, lng, lat)
}

// --------------------------------------------------------------------------
// Country basic-info (Change 6).
// --------------------------------------------------------------------------
// Look up the bundled facts for a country and shape them for the info card.
// Returns null when we have no facts row (the card then shows only what the
// geometry seed already carries — region + flag). Pure and exported so the
// data join is unit-testable without rendering.
export function lookupCountryInfo(iso3, facts = COUNTRY_FACTS) {
  if (!iso3 || !facts || typeof facts !== 'object') return null
  const row = facts[iso3]
  if (!row || typeof row !== 'object') return null
  const languages = Array.isArray(row.lang) ? row.lang.filter(Boolean) : []
  return {
    capital: row.cap || '',
    population: typeof row.pop === 'number' ? row.pop : null,
    area: typeof row.area === 'number' ? row.area : null,
    languages,
  }
}

// Human-readable population — grouped thousands (1,393,409,038). Falls back to
// an em dash so a missing value reads as "unknown", not "zero".
export function formatPopulation(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

// Human-readable surface area in km² with grouped thousands. Same em-dash
// fallback as population so a missing area never renders a bare "0 km²".
export function formatArea(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${Math.round(value).toLocaleString('en-US')} km²`
}

// Join the main languages into one readable string, capped so a multilingual
// country (e.g. Switzerland's four) doesn't overflow the card.
export function formatLanguages(languages, max = 3) {
  if (!Array.isArray(languages) || languages.length === 0) return '—'
  const shown = languages.slice(0, max)
  const extra = languages.length - shown.length
  return extra > 0 ? `${shown.join(', ')} +${extra}` : shown.join(', ')
}

// localStorage cache keys — the offline runtime caches storage.get reads
// but cold-reload-without-runtime needs *some* local mirror or the boot
// screen shows nothing forever. We mirror atlas + countries on every
// successful read; the boot path consults the cache first if the network
// read returns null. Scoped by appId so two installs don't collide. The
// legacy `visited-app:` prefix preserves offline cache across the Visited
// -> Atlas rename.
export const CACHE_KEY = (appId, name) => `atlas-app:${appId}:${name}`
export const LEGACY_CACHE_KEY = (appId, name) => `visited-app:${appId}:${name}`

export function cacheRead(appId, name) {
  if (typeof localStorage === 'undefined') return null
  try {
    const key = CACHE_KEY(appId, name)
    const legacyKey = LEGACY_CACHE_KEY(appId, name)
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
    const legacyRaw = localStorage.getItem(legacyKey)
    if (!legacyRaw) return null
    const value = JSON.parse(legacyRaw)
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    return value
  } catch {
    return null
  }
}

export function cacheWrite(appId, name, data) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY(appId, name), JSON.stringify(data))
  } catch {
    // Quota or private-mode — silent; cache is a nice-to-have.
  }
}

// Dedupe a country list by iso3, keeping the first occurrence. The
// bundled GeoJSON ships duplicate entries for CYP / GUF / SOM, which
// (a) inflates the total count, and (b) produces duplicate React keys.
// We log a warning so the dupe doesn't go silent if the seed ever changes.
function dedupeCountries(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  const dupes = []
  for (const c of list) {
    const iso3 = c?.iso3
    if (!iso3) continue
    if (seen.has(iso3)) {
      dupes.push(iso3)
      continue
    }
    seen.add(iso3)
    out.push(c)
  }
  if (dupes.length) {
    // eslint-disable-next-line no-console
    console.warn('Atlas: dropped duplicate iso3 entries from seed', dupes)
  }
  return out
}

function toIsoSet(values) {
  if (values instanceof Set) return new Set([...values].filter(Boolean))
  if (Array.isArray(values)) return new Set(values.filter(Boolean))
  return new Set()
}

// List order is alphabetical and INDEPENDENT of visited/wishlist state.
// It used to rank marked countries first, which meant every tap re-sorted
// the list out from under the user's thumb — mark a country mid-scroll and
// the row teleported toward the top. Stable order keeps the row exactly
// where it was; the status filter (see filterCountriesByStatus) is how the
// user asks for "just my visited" instead.
export function orderCountriesForList(countries, query = '') {
  if (!Array.isArray(countries)) return []
  const text = soften(query)
  return countries
    .filter((country) => {
      if (!country || typeof country !== 'object') return false
      if (!text) return true
      return [
        country.displayName,
        country.name,
        country.region,
        country.subregion,
        country.iso2,
        country.iso3,
      ]
        .filter(Boolean)
        .some((value) => soften(value).includes(text))
    })
    .sort((a, b) => {
      const an = String(a.displayName || a.name || a.iso3 || '')
      const bn = String(b.displayName || b.name || b.iso3 || '')
      const nameOrder = an.localeCompare(bn)
      if (nameOrder !== 0) return nameOrder
      return String(a.iso3 || '').localeCompare(String(b.iso3 || ''))
    })
}

// The three status filters the chips offer. 'all' is the resting state.
export const STATUS_FILTERS = ['all', 'visited', 'wishlist']

// Status filtering is separate from ordering so the list can be narrowed
// without ever being re-sorted. Visited wins over wishlist when malformed
// persisted data lists a country in both sets — the same exclusivity
// toggleCountryStatus maintains.
export function filterCountriesByStatus(countries, filter, visitedValues = new Set(), wishlistValues = new Set()) {
  if (!Array.isArray(countries)) return []
  if (filter === 'visited') {
    const visitedSet = toIsoSet(visitedValues)
    return countries.filter((country) => visitedSet.has(country?.iso3))
  }
  if (filter === 'wishlist') {
    const visitedSet = toIsoSet(visitedValues)
    const wishlistSet = toIsoSet(wishlistValues)
    return countries.filter(
      (country) => wishlistSet.has(country?.iso3) && !visitedSet.has(country?.iso3),
    )
  }
  return countries
}

export function toggleCountryStatus(visitedValues, wishlistValues, iso3, status) {
  const visitedSet = toIsoSet(visitedValues)
  const wishlistSet = toIsoSet(wishlistValues)
  if (!iso3) return { visited: visitedSet, wishlist: wishlistSet }
  if (status === 'visited') {
    if (visitedSet.has(iso3)) visitedSet.delete(iso3)
    else {
      visitedSet.add(iso3)
      wishlistSet.delete(iso3)
    }
  } else if (status === 'wishlist') {
    if (wishlistSet.has(iso3)) wishlistSet.delete(iso3)
    else {
      wishlistSet.add(iso3)
      visitedSet.delete(iso3)
    }
  }
  return { visited: visitedSet, wishlist: wishlistSet }
}

// d3-geo treats a polygon's interior as the side to the LEFT of its ring
// winding. A ring wound the wrong way makes d3-geo fill the entire
// complement — a whole-hemisphere disc. Reversing every ring flips the
// winding back. Used by `normalizedCountries` to repair inverted features
// (the source GeoJSON ships Bermuda's outer ring counter-clockwise).
function reverseWinding(geometry) {
  const flip = (rings) => rings.map((ring) => ring.slice().reverse())
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: flip(geometry.coordinates) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { ...geometry, coordinates: geometry.coordinates.map(flip) }
  }
  return geometry
}

// --------------------------------------------------------------------------
// Globe — orthographic d3-geo projection on an SVG canvas.
//
// The globe only moves when the user moves it (drag to rotate, pinch /
// wheel / keys to zoom). An autonomous idle spin and a pan-to-country
// animation both used to live here; the spin was removed on owner feedback
// (a globe that drifts on its own fights the user's framing) and the pan
// was reverted earlier for hijacking tap-to-select.
// --------------------------------------------------------------------------
function Globe({
  countries,
  visited,
  wishlist,
  selectedIso3,
  statusFilter,
  onTapCountry,
  onTapOcean,
}) {
  const containerRef = useRef(null)
  const d3Ref = useRef(null)
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    startRotate: INITIAL_ROTATION.slice(),
  })
  const rotationRef = useRef(INITIAL_ROTATION.slice())
  // pinchRef holds the in-flight two-finger gesture. While active it owns
  // the globe: drag-rotate stands down (it checks pinchRef.current.active)
  // so the two gestures never fight over rotation.
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 })
  // Live pointer positions keyed by pointerId. A single entry = drag; a
  // second entry promotes the gesture to a pinch. This is the one place
  // that knows "how many fingers are down".
  const pointersRef = useRef(new Map())
  const zoomRef = useRef(1)
  // rAF coalescing — a fast drag fires pointermove at 60–120Hz, but each
  // setRotation rebuilds the d3 projection + geoPath and repaints all ~195
  // country paths. Coalesce: gesture handlers stash the latest solved rotation
  // in pendingRotationRef and ask for ONE frame (rafRef guards re-scheduling);
  // the frame flushes ref → state, so we re-render at most once per display
  // refresh no matter how many moves arrived between frames.
  const rafRef = useRef(0)
  const pendingRotationRef = useRef(null)
  // Release inertia — the last few move deltas give an angular velocity
  // [dLng, dLat] per frame; on release a decay loop (vel *= FRICTION) keeps
  // feeding rotation so the globe glides to rest instead of stopping dead.
  // inertiaRef holds that loop's frame id so pointerdown / unmount can cancel it.
  const velocityRef = useRef({ vLng: 0, vLat: 0, samples: [] })
  const inertiaRef = useRef(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rotation, setRotation] = useState(INITIAL_ROTATION.slice())
  // zoom is a multiplier on the base radius; see MIN_ZOOM/MAX_ZOOM. Held in
  // both a ref (read synchronously by gesture handlers) and state (drives
  // the re-render) the same way rotation is — setZoomBoth keeps them in sync.
  const [zoom, setZoom] = useState(1)
  const [ready, setReady] = useState(false)
  // True while a drag or release-glide is in flight. Flips at most twice per
  // gesture (grab → true, rest → false) — NOT per frame — so it costs no extra
  // renders, and lets the projection drop precision while the globe moves: a
  // coarser geoPath tessellation is cheaper to build + paint on every frame,
  // and the detail it skips is invisible on a spinning sphere. The crisp path
  // snaps back the instant motion settles.
  const [spinning, setSpinning] = useState(false)
  const spinningRef = useRef(false)
  const setSpinningBoth = useCallback((on) => {
    if (spinningRef.current === on) return
    spinningRef.current = on
    setSpinning(on)
  }, [])
  // depFailed used to be sticky for the rest of the session — a single
  // hiccupping import (e.g. SW updating mid-flight) blanked the globe
  // until full reload. Now it's paired with a counter that retries on
  // every reconnect (see the useEffect listening for window 'online').
  const [depAttempt, setDepAttempt] = useState(0)
  const [depFailed, setDepFailed] = useState(false)

  // d3-geo lives at runtime — resolved by the app frame's import map to the
  // self-hosted /vendor/d3-geo@3 bundle (no longer esm.sh), so the globe works
  // offline-deterministically with no third-party CDN hop. A 5s timeout still
  // races the import so a cold-start can't hang on the fetch indefinitely (the
  // same-origin /vendor module is normally instant, but the SW may be priming).
  // depAttempt is in the dep array so the reconnect retry below can force
  // another attempt.
  useEffect(() => {
    let active = true
    const timeoutMs = 5000
    let timeoutId = 0
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('d3-geo load timed out')), timeoutMs)
    })
    setDepFailed(false)
    Promise.race([import('d3-geo'), timeoutPromise])
      .then((mod) => {
        clearTimeout(timeoutId)
        if (!active) return
        d3Ref.current = mod
        setReady(true)
      })
      .catch((err) => {
        clearTimeout(timeoutId)
        // eslint-disable-next-line no-console
        console.error('d3-geo failed to load', err)
        if (active) setDepFailed(true)
      })
    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [depAttempt])

  // When the browser reconnects, retry the d3-geo import if it failed. The
  // /vendor copy is precached by the SW, so this is just belt-and-braces for a
  // cold start that timed out before the precache settled; it kicks the effect
  // to try again.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const retry = () => {
      if (!d3Ref.current) setDepAttempt((n) => n + 1)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  // Track the visible size of the SVG host so the projection rescales when
  // the bottom sheet drags up/down.
  useEffect(() => {
    if (!containerRef.current) return
    const measure = () => {
      if (!containerRef.current) return
      setSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Cancel a pending coalesced frame — called on pointerdown (so a fresh grab
  // doesn't flush a stale frame) and on unmount.
  const cancelRotationFrame = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    pendingRotationRef.current = null
  }, [])

  // Cancel the release-inertia decay loop — called on the next pointerdown so a
  // new grab takes over cleanly, and on unmount.
  const cancelInertia = useCallback(() => {
    if (inertiaRef.current) {
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = 0
    }
  }, [])

  // Coalesced rotation setter — gesture handlers call this on EVERY pointer
  // move; it only schedules one rAF per frame. rotationRef stays live (so the
  // versor solver always reads the freshest baseline), but setRotation — the
  // expensive re-render — fires once per frame from the flush below.
  const scheduleRotation = useCallback((next) => {
    rotationRef.current = next // keep the gesture baseline exact between frames
    pendingRotationRef.current = next
    if (rafRef.current) return // a frame is already queued; it'll pick up the latest
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const pending = pendingRotationRef.current
      pendingRotationRef.current = null
      if (pending) setRotation(pending)
    })
  }, [])

  // Record one move's angular delta so finishDrag can read the release velocity.
  // We keep the last VELOCITY_SAMPLES so a jittery final frame doesn't define
  // the whole glide; the average is the flick the user actually made.
  const recordVelocity = useCallback((prev, next) => {
    const dLng = shortestLngDelta(prev[0] ?? 0, next[0] ?? 0)
    const dLat = (next[1] ?? 0) - (prev[1] ?? 0)
    const v = velocityRef.current
    v.samples.push([dLng, dLat])
    if (v.samples.length > VELOCITY_SAMPLES) v.samples.shift()
  }, [])

  // Run the release glide. Reads the averaged sample velocity, clamps it, then
  // feeds rotation each frame with vel *= friction until it drops below the
  // perceptible-motion threshold. Cancelled by the next pointerdown / unmount.
  // Owns the "spinning" flag for the glide's lifetime: any exit without a live
  // loop clears it so the projection snaps back to crisp the moment it rests.
  const startInertia = useCallback(() => {
    cancelInertia()
    const samples = velocityRef.current.samples
    let vLng = samples.length ? samples.reduce((s, d) => s + d[0], 0) / samples.length : 0
    let vLat = samples.length ? samples.reduce((s, d) => s + d[1], 0) / samples.length : 0
    // Clamp the flick magnitude so a fast swipe glides briskly but stays read-
    // able rather than blurring; tiny drifts below the floor never start a loop.
    const speed = Math.hypot(vLng, vLat)
    if (speed < INERTIA_MIN_SPEED) {
      setSpinningBoth(false) // released without a flick — rest now, paint crisp
      return
    }
    if (speed > INERTIA_MAX_SPEED) {
      const k = INERTIA_MAX_SPEED / speed
      vLng *= k
      vLat *= k
    }
    const step = () => {
      vLng *= INERTIA_FRICTION
      vLat *= INERTIA_FRICTION
      if (Math.hypot(vLng, vLat) < INERTIA_MIN_SPEED) {
        inertiaRef.current = 0
        setSpinningBoth(false) // glide settled — repaint crisp
        return
      }
      const cur = rotationRef.current
      const next = nextDragRotation(cur, (cur[0] ?? 0) + vLng, (cur[1] ?? 0) + vLat)
      if (next) {
        rotationRef.current = next
        setRotation(next) // already one update per frame — no extra coalescing needed
      }
      inertiaRef.current = requestAnimationFrame(step)
    }
    inertiaRef.current = requestAnimationFrame(step)
  }, [cancelInertia, setSpinningBoth])

  // Cancel any in-flight frame / inertia loop when the globe unmounts so a
  // late rAF can't call setState on a torn-down component.
  useEffect(() => () => {
    cancelRotationFrame()
    cancelInertia()
  }, [cancelRotationFrame, cancelInertia])

  // The single owner of "current zoom". Clamps to [MIN_ZOOM, MAX_ZOOM] so no
  // caller has to remember the bounds, then writes the ref (read by gesture
  // handlers) and state (drives the projection) together.
  const setZoomBoth = useCallback((next) => {
    const safe = Number.isFinite(next) && next > 0 ? next : zoomRef.current
    const clamped = clamp(safe, MIN_ZOOM, MAX_ZOOM)
    zoomRef.current = clamped
    setZoom(clamped)
  }, [])

  // Multiply the current zoom by a factor — the shape every input speaks
  // (pinch ratio, wheel notch, +/- step). Multiplicative so a step feels
  // the same whether you're zoomed in or out, and so it stays symmetric:
  // factor f then 1/f returns you exactly where you started.
  const zoomBy = useCallback(
    (factor) => {
      if (!Number.isFinite(factor) || factor <= 0) return
      setZoomBoth(zoomRef.current * factor)
    },
    [setZoomBoth],
  )

  // Repair inverted-winding features once d3-geo is loaded. Some source
  // features (here: Bermuda) ship an outer ring wound the wrong way; d3-geo
  // then fills the whole hemisphere for that feature, which both paints a
  // giant disc AND — because each country path is the tap target — swallows
  // every globe tap (the "tapping the globe selects Bermuda" bug). geoArea
  // > 2π is the signature of an inverted feature; rewind it. Memoized so the
  // ~180 area checks run once per data/d3-ready change, not per render.
  const normalizedCountries = useMemo(() => {
    const d3 = d3Ref.current
    if (!d3) return countries
    const FULL_SPHERE = 2 * Math.PI
    const areaOf = (geometry) =>
      d3.geoArea({ type: 'Feature', properties: {}, geometry })
    return countries.map((c) => {
      let geometry = c.geometry
      // A single corrupt sub-polygon — a near-zero-area / degenerate ring —
      // makes d3-geo report the WHOLE feature as spanning >2π; it then fills the
      // entire front hemisphere and (each country path being its own tap target)
      // swallows every globe tap. A real country sub-polygon never spans more
      // than a hemisphere on its own, so drop any that does. Guards the render
      // against bad dataset geometry (a rebuild once shipped such a ring for
      // Russia) without discarding the whole country.
      if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
        const kept = geometry.coordinates.filter(
          (poly) => areaOf({ type: 'Polygon', coordinates: poly }) <= FULL_SPHERE
        )
        if (kept.length && kept.length !== geometry.coordinates.length) {
          geometry = { ...geometry, coordinates: kept }
        }
      }
      // Genuine inverted winding (e.g. Bermuda) still fills the hemisphere after
      // the drop above; rewind the whole feature so d3 fills its interior.
      return areaOf(geometry) > FULL_SPHERE
        ? { ...c, geometry: reverseWinding(geometry) }
        : { ...c, geometry }
    })
  }, [countries, ready])

  // Paint the selected country last. SVG stacks in document order, so a
  // selected feature drawn early gets its boundary overpainted along every
  // border it shares with a later-drawn neighbor. Reordering only the
  // render keeps the list/tab order story simple (React moves the keyed <g>,
  // hit-testing is unaffected — fills tile, so nothing new occludes a tap).
  const renderCountries = useMemo(() => {
    if (!selectedIso3) return normalizedCountries
    const selected = normalizedCountries.find((c) => c.iso3 === selectedIso3)
    if (!selected) return normalizedCountries
    return [...normalizedCountries.filter((c) => c.iso3 !== selectedIso3), selected]
  }, [normalizedCountries, selectedIso3])

  // Re-compute projection on every rotation/zoom/size change.
  const projectionData = useMemo(() => {
    if (!ready || !d3Ref.current || !size.width || !size.height) return null
    const d3 = d3Ref.current
    // Base radius — 52% of the smaller dim makes the default globe read as the
    // hero of the screen (it was 46%, sized for the old half-height list; with
    // the list now collapsed by default the globe has the room to be bigger).
    // zoom (a multiplier) scales it; the radius below is the *visible* radius,
    // so the halo/sphere geometry tracks the zoom too.
    const radius = Math.min(size.width, size.height) * 0.52 * zoom
    const projection = d3
      .geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(radius)
      .clipAngle(90)
      .rotate(rotation)
      // Coarser tessellation while the globe is in motion (drag / glide) — the
      // adaptive-resampling threshold a path subdivides to. The extra vertices
      // a crisp 0.4 buys are imperceptible on a moving sphere but cost real time
      // every frame; 1.6 paints ~the same silhouette far cheaper, then we snap
      // back to crisp the instant it rests.
      .precision(spinning ? 1.6 : 0.4)
    const path = d3.geoPath(projection)
    const graticule = d3.geoGraticule10()
    return { projection, path, graticule, radius }
  }, [ready, rotation, zoom, size.height, size.width, spinning])

  // ----- pointer drag + pinch-zoom -------------------------------------
  // One finger rotates; a second finger promotes the gesture to a pinch
  // that zooms (and suspends rotation). The pointer count in pointersRef is
  // the single source of truth for which mode we're in.

  // Re-seat the drag baseline at the leftover pointer's current position so
  // rotation continues from where the finger is — without this, lifting one
  // finger after a pinch would snap the globe by the accumulated delta.
  const reseatDrag = (pointer) => {
    dragRef.current = {
      active: true,
      moved: true, // a pinch happened; never treat the lift-off as a tap
      startX: pointer.x,
      startY: pointer.y,
      startRotate: rotationRef.current.slice(),
      // Re-grab the versor baseline on the next move (see onPointerMove).
      v0: null,
      q0: null,
    }
  }

  const onPointerDown = (event) => {
    event.currentTarget.blur?.()
    // A fresh grab takes over: stop any glide already in flight and drop a
    // queued coalesced frame so the new gesture starts from the live rotation.
    cancelInertia()
    cancelRotationFrame()
    velocityRef.current.samples = []
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointersRef.current.size >= 2) {
      // Second finger down — enter pinch. Drag stands down (and is flagged
      // moved so the gesture can't end in a tap).
      dragRef.current.active = false
      dragRef.current.moved = true
      pinchRef.current = {
        active: true,
        startDist: pinchSpread(pointersRef.current) || 1,
        startZoom: zoomRef.current,
      }
    } else {
      // Drag-rotate begins — mark the globe in-motion so the projection drops
      // to the cheaper tessellation for the duration of the gesture + glide.
      setSpinningBoth(true)
      dragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        startRotate: rotationRef.current.slice(),
        // Versor baseline (grab point as a unit vector + the rotation-at-grab
        // as a quaternion) is captured on the first move, once we have the
        // pointer's position relative to the SVG.
        v0: null,
        q0: null,
      }
    }
  }

  const onPointerMove = (event) => {
    const pointer = pointersRef.current.get(event.pointerId)
    if (pointer) {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    if (pinchRef.current.active) {
      // Zoom tracks the spread ratio so the pinch feels anchored to the
      // fingers: spread the same factor the globe scaled by. setZoomBoth
      // clamps, so over-pinching past the bounds simply rests at the limit.
      const spread = pinchSpread(pointersRef.current)
      setZoomBoth((pinchRef.current.startZoom * spread) / pinchRef.current.startDist)
      return
    }
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true

    // Versor drag: solve the rotation that carries the point first grabbed to
    // the point now under the pointer, so the surface stays glued to the finger
    // at any zoom, viewport, and latitude. (A fixed deg/px slips — the same
    // finger travel sweeps a different angle as the on-screen radius and the
    // limb foreshortening change, which is why dragging never felt like the
    // earth's surface.) The pointer is clamped just inside the silhouette before
    // every invert (easePointerToDisc), so a drag that reaches the edge stays
    // smooth and stable instead of snapping — see solveVersorDrag. Falls back to a
    // radius-scaled deg/px only when d3 isn't ready yet.
    const d3 = d3Ref.current
    const drag = dragRef.current
    if (d3 && projectionData) {
      const rect = event.currentTarget.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const cx = size.width / 2
      const cy = size.height / 2
      const radius = projectionData.radius
      const makeProjection = (rot) =>
        d3
          .geoOrthographic()
          .translate([cx, cy])
          .scale(radius)
          .clipAngle(90)
          .rotate(rot)
      // Capture the grab baseline on the first move of the gesture (and after a
      // pinch hands control back). Soft-ease the grab pixel into the disc too, so
      // a gesture that STARTS near the edge still anchors to a real surface point
      // instead of falling back to the linear path.
      if (!drag.v0) {
        const [gx, gy] = easePointerToDisc(px, py, cx, cy, radius)
        const grab = makeProjection(rotationRef.current).invert([gx, gy])
        if (grab && Number.isFinite(grab[0]) && Number.isFinite(grab[1])) {
          drag.startRotate = rotationRef.current.slice()
          drag.v0 = versorCartesian(grab)
          drag.q0 = versorFromAngles(drag.startRotate)
        }
      }
      if (drag.v0) {
        const next = solveVersorDrag({
          makeProjection,
          startRotate: drag.startRotate,
          v0: drag.v0,
          q0: drag.q0,
          current: rotationRef.current,
          px,
          py,
          cx,
          cy,
          radius,
        })
        // null → this frame would cross a pole or inverted off-sphere; hold the
        // last good rotation (the gesture stays alive for the next move).
        if (next) {
          recordVelocity(rotationRef.current, next)
          scheduleRotation(next)
        }
        return
      }
    }

    // Fallback: radius-scaled deg/px — exact at the globe centre for any zoom
    // and viewport. Used only while d3 loads (before the versor path can run).
    const degPerPx = projectionData ? RAD2DEG / projectionData.radius : 0.4 / zoomRef.current
    const [startLng, startLat] = drag.startRotate
    const next = nextDragRotation(rotationRef.current, startLng + dx * degPerPx, startLat - dy * degPerPx)
    if (next) {
      recordVelocity(rotationRef.current, next)
      scheduleRotation(next)
    }
  }

  const finishDrag = (event) => {
    pointersRef.current.delete(event.pointerId)
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (pinchRef.current.active) {
      if (pointersRef.current.size >= 2) {
        // Still pinching with a different pair — re-seat the baseline so the
        // zoom doesn't jump when the contributing fingers change.
        pinchRef.current.startDist = pinchSpread(pointersRef.current) || 1
        pinchRef.current.startZoom = zoomRef.current
        return
      }
      // Dropped out of pinch. If one finger remains, hand control back to
      // drag-rotate from its current spot; otherwise the gesture is over.
      pinchRef.current.active = false
      const [leftover] = [...pointersRef.current.values()]
      if (leftover) {
        reseatDrag(leftover)
        return
      }
    }
    if (pointersRef.current.size > 0) return // other fingers still down
    const wasDrag = dragRef.current.active && dragRef.current.moved
    dragRef.current.active = false

    // Release glide — only when the finger actually dragged (a tap selects and
    // must not spin). Drop any queued coalesced frame first so the inertia loop
    // owns rotation outright and starts from the live value, then decay to rest.
    // startInertia owns the spinning flag once a drag releases; a non-drag
    // (tap, or a gesture that opened with a finger but never moved) rests now.
    if (wasDrag) {
      cancelRotationFrame()
      startInertia()
    } else {
      setSpinningBoth(false)
    }
    velocityRef.current.samples = []

    // Tap means select — never zoom. A double-tap zoom used to live here
    // and it hijacked country selection (rapid taps read as zoom); pinch,
    // wheel, and the keyboard +/- are the zoom surface.

    // Defer the moved flag so onClick (which fires after pointerup) still
    // sees moved=true and skips the tap when the user was dragging.
    setTimeout(() => {
      dragRef.current.moved = false
    }, 0)
  }
  const onPointerUp = (event) => finishDrag(event)
  const onPointerCancel = (event) => finishDrag(event)
  // Route pointer-leave through finishDrag so we always release capture
  // and clear the moved flag — earlier this just flipped active=false
  // and left the moved flag dangling, which could swallow the next tap.
  const onPointerLeave = (event) => finishDrag(event)
  // Some browsers fire lostpointercapture without a paired pointerup
  // (e.g. iOS Safari when a modal overlays mid-drag). Treat that as a
  // drag finish so we don't get stuck with dragRef.active=true.
  const onLostPointerCapture = (event) => finishDrag(event)

  // Wheel / trackpad zoom on desktop. Exponential in deltaY so each notch is
  // a constant proportional change (and the clamp behaves the same near both
  // ends). passive:false isn't available on React's synthetic onWheel, but
  // touchAction:none on the SVG already stops the page from scrolling under
  // a trackpad pinch.
  const onWheel = (event) => {
    event.preventDefault()
    const delta = clamp(event.deltaY || 0, -600, 600)
    zoomBy(Math.exp(-delta * 0.0015))
  }

  // Keyboard zoom — +/- (and =, the unshifted +) when the globe has focus.
  // Cheap a11y win: zoom without a pointer at all.
  const onKeyDown = (event) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(ZOOM_STEP)
    } else if (event.key === '-') {
      event.preventDefault()
      zoomBy(1 / ZOOM_STEP)
    }
  }

  return (
    <div ref={containerRef} className="cb-globe-canvas">
      {depFailed ? (
        <div className="cb-globe-loading cb-globe-loading--offline" role="status">
          Globe needs one online load — pull to refresh when you're back online.
        </div>
      ) : !projectionData ? (
        <div className="cb-globe-loading">Loading the world…</div>
      ) : (
        <svg
          className="cb-globe-svg"
          viewBox={`0 0 ${size.width} ${size.height}`}
          tabIndex={0}
          aria-label="Globe — drag to spin, pinch or +/- to zoom"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          onLostPointerCapture={onLostPointerCapture}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          style={{
            cursor: dragRef.current.active ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          <defs>
            <radialGradient id="cb-ocean" cx="40%" cy="32%">
              <stop offset="0%" stopColor="var(--cb-ocean-1)" />
              <stop offset="55%" stopColor="var(--cb-ocean-2)" />
              <stop offset="100%" stopColor="var(--cb-ocean-3)" />
            </radialGradient>
            <radialGradient id="cb-shine" cx="35%" cy="28%">
              <stop offset="0%" stopColor="var(--cb-shine-1)" />
              <stop offset="45%" stopColor="var(--cb-shine-2)" />
              <stop offset="100%" stopColor="var(--cb-shine-3)" />
            </radialGradient>
            <filter id="cb-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="16" />
            </filter>
          </defs>

          {/* Outer accent halo. Radius shrunk from 1.06× to 1.02× so the
             blur (stdDeviation 16) doesn't leak past the SVG edge on
             short layouts; the glow now feels like it belongs to the
             globe rather than the container. */}
          <circle
            cx={size.width / 2}
            cy={size.height / 2}
            r={projectionData.radius * 1.02}
            fill="var(--accent)"
            opacity="0.14"
            filter="url(#cb-glow)"
          />

          {/* Ocean sphere — stroke derives from --text so the rim stays
             visible on light themes (where pure-white would vanish).
             Tapping the ocean clears selection (so the user can return
             to the unfiltered list without hunting for the close X). */}
          <path
            d={projectionData.path({ type: 'Sphere' })}
            fill="url(#cb-ocean)"
            stroke="color-mix(in srgb, var(--text) 22%, transparent)"
            strokeWidth="1"
            onClick={() => {
              if (dragRef.current.moved) return
              onTapOcean?.()
            }}
            style={{ cursor: 'pointer' }}
          />

          {/* Graticule */}
          <path
            d={projectionData.path(projectionData.graticule)}
            fill="none"
            stroke="color-mix(in srgb, var(--text) 14%, transparent)"
            strokeWidth="0.6"
          />

          {/* Countries — each path is wrapped in a <g role="button"> with
             an accessible name + a <title> child. Screen readers read the
             country name (and visited state) instead of "image image image",
             and hover tooltips surface the name on desktop. tabIndex and
             a keyboard handler make small-country selection reachable
             without a sub-pixel tap. */}
          {renderCountries.map((country) => {
            const d = projectionData.path({
              type: 'Feature',
              properties: {},
              geometry: country.geometry,
            })
            if (!d) return null
            const isVisited = visited.has(country.iso3)
            const isWishlisted = wishlist.has(country.iso3)
            const isSelected = country.iso3 === selectedIso3
            // Mirror the list's status filter on the globe: countries that
            // don't match fade back so the matching set reads at a glance.
            // The selected country never dims — selection outranks filters.
            const matchesFilter =
              !statusFilter ||
              statusFilter === 'all' ||
              (statusFilter === 'visited' ? isVisited : isWishlisted && !isVisited)
            const isDimmed = !matchesFilter && !isSelected
            const label = isVisited
              ? `${country.displayName} — visited`
              : isWishlisted
                ? `${country.displayName} — want to visit`
              : country.displayName
            return (
              <g
                key={country.iso3}
                role="button"
                tabIndex={0}
                aria-label={label}
                onClick={(event) => {
                  event.currentTarget.blur?.()
                  if (dragRef.current.moved) return
                  onTapCountry(country)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onTapCountry(country)
                  }
                }}
              >
                <title>{label}</title>
                <path
                  d={d}
                  className={
                    'cb-country' +
                    (isVisited ? ' cb-country--visited' : '') +
                    (isWishlisted ? ' cb-country--wishlist' : '') +
                    (isSelected ? ' cb-country--selected' : '') +
                    (isDimmed ? ' cb-country--dimmed' : '')
                  }
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )
          })}

          {/* Specular shine */}
          <path
            d={projectionData.path({ type: 'Sphere' })}
            fill="url(#cb-shine)"
            opacity="0.18"
            pointerEvents="none"
          />
        </svg>
      )}

      {/* Zoom is driven by wheel/trackpad, pinch, and the +/- keys (see the
         gesture handlers + onKeyDown). The on-screen +/- buttons were removed
         so the globe surface is uncluttered — scroll/pinch to zoom is the
         expected gesture and the keyboard path keeps it accessible. */}
    </div>
  )
}

// --------------------------------------------------------------------------
// Bottom sheet — vertically draggable list + search.
// --------------------------------------------------------------------------
// The sheet opens COLLAPSED so the globe is the hero. SHEET_MIN ≈ 34% of the
// viewport so the list shows ~3 full country rows at rest (rows are ~62px;
// after the 26px handle + the ~58px search/filter row, 34% of an ~890px
// viewport leaves ~205px of list ≈ three rows). The earlier 22% only cleared
// one row — the owner wanted ~3 visible without dragging. The list still
// scrolls within the band, and the handle drags up to SHEET_MID / SHEET_MAX
// for the full list; this collapsed default just stops the list from eating
// the globe while still showing enough rows to feel like a list.
const SHEET_MIN = 0.34  // ~34% of viewport — collapsed, ~3 rows; the open default
const SHEET_MID = 0.50  // 50% — neutral, dragged-to
const SHEET_MAX = 0.80  // 80% — expanded, dragged-to
const SHEET_STOPS_DEFAULT = [SHEET_MIN, SHEET_MID, SHEET_MAX]
// The fraction the sheet opens at. Collapsed by default (see above); kept as a
// named const next to the stops so "how much screen the list takes on open" is
// a single, obvious knob.
const SHEET_OPEN_DEFAULT = SHEET_MIN

// Icon-only filter chips — globe = everything, check = visited, star =
// wishlist. Inline SVGs, not unicode glyphs, for the same reason as the
// search icon (codepoints render as tofu on some Android WebViews); the
// aria-label + title carry the meaning for screen readers and desktop hover.
const FILTER_CHIPS = [
  {
    id: 'all',
    label: 'Show all countries',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="9" cy="9" r="6.75" />
        <ellipse cx="9" cy="9" rx="3.1" ry="6.75" />
        <line x1="2.25" y1="9" x2="15.75" y2="9" />
      </svg>
    ),
  },
  {
    id: 'visited',
    label: 'Show visited only',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <polyline points="3.2,9.6 7.2,13.4 14.8,4.8" />
      </svg>
    ),
  },
  {
    id: 'wishlist',
    label: 'Show wishlist only',
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M9 2.4 L10.9 6.7 15.6 7.2 12.1 10.4 13.1 15 9 12.5 4.9 15 5.9 10.4 2.4 7.2 7.1 6.7 Z" />
      </svg>
    ),
  },
]

function BottomSheet({
  countries,
  visited,
  wishlist,
  selectedCountry,
  query,
  statusFilter,
  onQueryChange,
  onFilterChange,
  onSelect,
  onToggleVisited,
  onToggleWishlist,
  onDeselect,
}) {
  const dragRef = useRef({ active: false, startY: 0, startFrac: SHEET_OPEN_DEFAULT, fromBody: false })
  const [frac, setFrac] = useState(SHEET_OPEN_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef(null)

  // Opening a country must NOT resize the sheet (owner feedback: the panel
  // jumped when you tapped a country). There is deliberately no auto-lift on
  // selection — the sheet stays at whatever height it's at, and the detail
  // view fits within that band: a fixed header + pinned action bar frame a
  // single scrolling body (see .cb-detail-body overflow-y:auto), so the facts
  // scroll internally while the name and CTAs stay put and nothing clips. The
  // user can still drag the handle up for more room; tapping a country just
  // never moves it for them.

  const minFrac = SHEET_MIN
  const stops = SHEET_STOPS_DEFAULT

  // Drag math reused by both the handle and the body. dragRef.startFrac
  // captures the sheet height at gesture start; dy is converted to a
  // frac delta using visualViewport.height so a soft keyboard doesn't
  // skew the math. We use visualViewport for *both* the displayed sheet
  // height (CSS percent of the visual viewport) and the drag conversion
  // so the user's finger and the sheet edge stay aligned.
  const startDrag = (event, fromBody) => {
    dragRef.current = {
      active: true,
      fromBody,
      startY: event.clientY,
      startFrac: frac,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event) => {
    if (!dragRef.current.active) return
    const dy = event.clientY - dragRef.current.startY
    const rawVh =
      (typeof window !== 'undefined' && window.visualViewport?.height) ||
      window.innerHeight ||
      800
    const vh = Number.isFinite(rawVh) && rawVh > 120 ? rawVh : 800
    // Drag up = sheet grows = frac increases. dy is positive downward.
    const next = clamp(dragRef.current.startFrac - dy / vh, minFrac, SHEET_MAX)
    setFrac(next)
  }
  const endDrag = (event) => {
    dragRef.current.active = false
    setDragging(false)
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Snap to the nearest legal stop so the sheet always rests in a known
    // pose, preserving the user's chosen height across list/detail modes.
    setFrac((current) => {
      let best = stops[0]
      let bestDist = Infinity
      for (const stop of stops) {
        const d = Math.abs(stop - current)
        if (d < bestDist) {
          best = stop
          bestDist = d
        }
      }
      return best
    })
  }

  const onHandleDown = (event) => startDrag(event, false)
  const onHandleMove = moveDrag
  const onHandleUp = endDrag
  // lostpointercapture pairs with the same teardown — without this the
  // sheet can wedge in mid-drag after iOS Safari yanks capture.
  const onHandleLost = endDrag

  // The body of the sheet (list / detail) accepts drag-down too — but
  // only when the inner scroller is at the top. If the user is scrolling
  // a long list, we want native scroll; if they're at the top and pull
  // further, we treat that as a sheet drag.
  const onBodyDown = (event) => {
    const atTop = (scrollRef.current?.scrollTop || 0) <= 0
    if (!atTop) return
    startDrag(event, true)
  }
  const onBodyMove = (event) => {
    if (!dragRef.current.active || !dragRef.current.fromBody) return
    // If the user dragged UP from the top, prefer native scroll over
    // sheet expansion — release the drag.
    const dy = event.clientY - dragRef.current.startY
    if (dy < -8) {
      endDrag(event)
      return
    }
    moveDrag(event)
  }
  const onBodyUp = (event) => {
    if (dragRef.current.active && dragRef.current.fromBody) endDrag(event)
  }

  const isVisitedSelected = selectedCountry && visited.has(selectedCountry.iso3)
  const isWishlistedSelected = selectedCountry && wishlist.has(selectedCountry.iso3)

  // Basic-info card data (Change 6) — bundled facts joined by ISO-3. null when
  // we have no facts row; the card then shows only region (always present).
  const selectedInfo = selectedCountry ? lookupCountryInfo(selectedCountry.iso3) : null
  const infoRows = selectedInfo
    ? [
        { key: 'capital', label: 'Capital', value: selectedInfo.capital || '—' },
        { key: 'population', label: 'Population', value: formatPopulation(selectedInfo.population) },
        { key: 'area', label: 'Surface area', value: formatArea(selectedInfo.area) },
        { key: 'languages', label: 'Languages', value: formatLanguages(selectedInfo.languages) },
      ]
    : []

  return (
    <div
      className={'cb-sheet' + (dragging ? ' cb-sheet--dragging' : '')}
      style={{ height: `${frac * 100}%` }}
    >
      <div
        className="cb-sheet-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        onLostPointerCapture={onHandleLost}
        role="separator"
        aria-label="Resize sheet"
      >
        <span className="cb-sheet-grip" />
      </div>

      {/* Detail panel and list are ALWAYS mounted so the list's scrollTop is
          preserved by the DOM when the user goes back. CSS hides the inactive
          panel; the scroll container never unmounts, never resets to 0. */}
      <div
        className={'cb-detail' + (selectedCountry ? '' : ' cb-detail--hidden')}
        role="region"
        aria-label="Country detail"
        aria-hidden={!selectedCountry}
      >
        {selectedCountry && (
          <>
            {/* Condensed STICKY header — flag + name + region on one compact
                row, pinned to the top of the detail so the country you're
                looking at never scrolls out of view. The flag is smaller than
                the old 40px block so the header earns its keep on a short
                sheet (peek height) instead of eating the facts below it. */}
            <div className="cb-detail-head">
              <span className="cb-detail-flag" aria-hidden="true">
                {selectedCountry.flag || '🏳️'}
              </span>
              <div className="cb-detail-name">
                <strong>{selectedCountry.displayName}</strong>
                <small>
                  {selectedCountry.region || 'World'}
                  {selectedCountry.subregion ? ` · ${selectedCountry.subregion}` : ''}
                </small>
              </div>
              <button
                type="button"
                className="cb-detail-close"
                onClick={onDeselect}
                aria-label="Close country detail"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            {/* Scrollable body — the only region that scrolls. The sticky
                header above and the sticky action bar below stay put, so on a
                390px phone the country always has a visible identity and the
                Been / Want-to-go CTAs are always one tap away, no matter how
                tall the facts get or how short the sheet is dragged. */}
            <div className="cb-detail-body">
              {/* Basic-info card: capital / population / surface area / main
                  languages, joined from the bundled facts by ISO-3. A row whose
                  value is unknown renders an em dash, never a wrong "0". */}
              {infoRows.length > 0 ? (
                <dl className="cb-info">
                  {infoRows.map((row) => (
                    <div className="cb-info-row" key={row.key}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>

            {/* Sticky action bar — two independent status toggles ('Been' /
                'Want to go'). Marking one clears the other and each persists
                the same way (whole-list PUT of visited.json / wishlist.json).
                Pinned to the bottom so the primary action is always reachable
                even when the facts scroll. */}
            <div className="cb-detail-actions">
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--visited' + (isVisitedSelected ? ' is-on' : '')}
                onClick={() => onToggleVisited(selectedCountry)}
                aria-pressed={isVisitedSelected}
              >
                {isVisitedSelected ? 'Been ✓' : 'Been'}
              </button>
              <button
                type="button"
                className={'cb-detail-cta cb-detail-cta--wishlist' + (isWishlistedSelected ? ' is-on' : '')}
                onClick={() => onToggleWishlist(selectedCountry)}
                aria-pressed={isWishlistedSelected}
              >
                {isWishlistedSelected ? 'Want to go ★' : 'Want to go'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={'cb-list-panel' + (selectedCountry ? ' cb-list-panel--hidden' : '')}>
        <div className="cb-sheet-controls">
          <div className="cb-sheet-search">
            {/* Inline SVG, not U+2315 — the codepoint renders as tofu on some
                Android WebViews even when the system claims symbol coverage. */}
            <svg
              className="cb-sheet-search-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7" cy="7" r="4.5" />
              <line x1="10.5" y1="10.5" x2="13.5" y2="13.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search countries"
              aria-label="Search countries"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                className="cb-sheet-search-clear"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="3" y1="3" x2="11" y2="11" />
                  <line x1="11" y1="3" x2="3" y2="11" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Status filter — icon-only segmented control beside the search
              box. Filters the list (and dims non-matching countries on the
              globe); the choice persists across sessions via cacheWrite. */}
          <div className="cb-filters" role="group" aria-label="Filter countries by status">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={'cb-filter' + (statusFilter === chip.id ? ' is-on' : '')}
                aria-label={chip.label}
                aria-pressed={statusFilter === chip.id}
                title={chip.label}
                onClick={() => onFilterChange(chip.id)}
              >
                {chip.icon}
              </button>
            ))}
          </div>
        </div>

        <div
          className="cb-list"
          ref={scrollRef}
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
          onLostPointerCapture={onBodyUp}
        >
          {countries.length === 0 ? (
            <div className="cb-list-empty">
              {query
                ? 'No countries match.'
                : statusFilter === 'visited'
                  ? 'No countries marked “Been” yet — tap the ring on a row to add one.'
                  : statusFilter === 'wishlist'
                    ? 'Nothing on your “Want to go” list yet — tap the star on a row to add one.'
                    : 'No countries match.'}
            </div>
          ) : (
            countries.map((country) => {
              const isVisited = visited.has(country.iso3)
              const isWishlisted = wishlist.has(country.iso3)
              return (
                <div
                  key={country.iso3}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${country.displayName}`}
                  className={
                    'cb-row' +
                    (isVisited ? ' cb-row--visited' : '') +
                    (isWishlisted ? ' cb-row--wishlist' : '')
                  }
                  onClick={() => onSelect(country)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(country)
                    }
                  }}
                >
                  <span className="cb-row-flag" aria-hidden="true">
                    {country.flag || '🏳️'}
                  </span>
                  <span className="cb-row-text">
                    <strong>{country.displayName}</strong>
                    <small>
                      {country.region || 'World'}
                      {country.subregion ? ` · ${country.subregion}` : ''}
                    </small>
                  </span>
                  {/* Two one-tap status toggles per row (Change 5): the green
                      ring = 'Been', the star = 'Want to go'. Both stop
                      propagation so they mark without opening the detail.
                      Surfacing the wishlist on the row (not just inside the
                      detail) is what makes "want to go" discoverable. */}
                  <span className="cb-row-marks">
                    <button
                      type="button"
                      className={'cb-row-want' + (isWishlisted ? ' cb-row-want--on' : '')}
                      aria-label={isWishlisted
                        ? `Remove ${country.displayName} from want to go`
                        : `Add ${country.displayName} to want to go`}
                      aria-pressed={isWishlisted}
                      title={isWishlisted ? 'Want to go — tap to remove' : 'Tap to add to want to go'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleWishlist(country)
                      }}
                    >
                      <span aria-hidden="true">{isWishlisted ? '★' : '☆'}</span>
                    </button>
                    <button
                      type="button"
                      className={'cb-row-mark' + (isVisited ? ' cb-row-mark--on' : '')}
                      aria-label={isVisited
                        ? `Mark ${country.displayName} not been`
                        : `Mark ${country.displayName} been`}
                      aria-pressed={isVisited}
                      title={isVisited ? 'Been — tap to unmark' : 'Tap to mark been'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleVisited(country)
                      }}
                    >
                      <span aria-hidden="true">{isVisited ? '✓' : ''}</span>
                    </button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Sync pill — surfaces offline state next to the counter.
// --------------------------------------------------------------------------
// Only the offline state is surfaced. Local saves are instant and reliable;
// outbox depth ("Saving · N pending") is internal plumbing the owner doesn't
// need to read. Online → null (clean steady state).
// hasRuntime=false means the runtime didn't load (dev/fallback) — writes
// go direct to the server, so there's no outbox to surface. Hide the pill
// in that mode rather than lie about a queue that doesn't exist.
function SyncPill({ online, hasRuntime }) {
  if (!hasRuntime) return null
  if (online) return null
  return (
    <span
      className="cb-pill cb-pill--offline"
      role="status"
      aria-live="polite"
      title="You're offline — taps will sync when you're back online."
    >
      <span className="cb-pill-dot" aria-hidden="true" />
      Offline
    </span>
  )
}

// --------------------------------------------------------------------------
// App root.
// --------------------------------------------------------------------------
// Nav state machine — selection -> nav-push -> ack races used to leave
// phantom history entries when the user closed the detail before the ACK
// landed. Now: selection in IDLE issues a push and transitions to PUSHING;
// the ACK promotes PUSHING -> OPEN; the shell's nav-back returns OPEN ->
// IDLE; user-initiated close from PUSHING is recorded so the late ACK
// auto-pops; from OPEN it issues nav-pop and goes POPPING.
const NAV_IDLE = 'idle'
const NAV_PUSHING = 'pushing'
const NAV_OPEN = 'open'
const NAV_POPPING = 'popping'

// ----------------------------------------------------------------- styles ---

const CSS = `
/* mobius-ui:NativeTouch v1 — keep in sync; library candidate. Diverge below the marker only. */
* { -webkit-tap-highlight-color: transparent; }
.cb-sheet-handle, .cb-detail-cta, .cb-detail-close, .cb-sheet-search-clear, .cb-row {
  touch-action: manipulation;
}
.cb-header, .cb-counter, .cb-pill, .cb-detail-flag, .cb-row-flag {
  user-select: none; -webkit-user-select: none;
}
.cb-detail-close:active { transform: scale(0.94); }
.cb-list { overscroll-behavior: contain; }
.cb-detail-body { overscroll-behavior: contain; }
.cb-sheet-search input { font-size: 16px; }
@media (hover: hover) {
  .cb-country:hover { fill: var(--cb-land-hover); }
  .cb-row:hover {
    background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  }
  .cb-sheet-search-clear:hover { color: var(--text); }
  .cb-detail-close:hover {
    background: var(--surface2, var(--surface));
    color: var(--text);
  }
}
/* /mobius-ui:NativeTouch */

/* mobius-ui:Focus v1 -- shared keyboard focus ring (WCAG 2.4.7); never bare outline:none */
:where(button,a,input,textarea,select,summary,[role="button"],[tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* /mobius-ui:Focus */

/* mobius-ui:Root v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-app {
  /* mobius-ui:identity-palette — DELIBERATE divergence. The ocean blue is
     an atlas-identity color the theme tokens can't express; it keeps a
     stable atlas identity while mixing in the active theme background so
     standalone installs and shell embeds do not feel like different apps.
     Keep these hardcoded hex; everything else rides the theme tokens. */
  --cb-ocean-1: color-mix(in srgb, #3f8cff 88%, var(--bg) 12%);
  --cb-ocean-2: color-mix(in srgb, #1764c7 92%, var(--bg) 8%);
  --cb-ocean-3: color-mix(in srgb, #0b2f73 94%, var(--bg) 6%);
  /* /mobius-ui:identity-palette */
  /* Specular shine — a soft highlight. Mixing with literal white
     read OK on dark themes but flat-out vanished into the page on
     light ones; mix toward --bg so the highlight sits one shade
     lighter than the underlying surface in every theme. The
     accent tint keeps the globe feeling planet-shaped rather
     than just paler-than-its-frame. */
  --cb-shine-1: color-mix(in srgb, #ffffff 38%, transparent);
  --cb-shine-2: color-mix(in srgb, #ffffff 12%, transparent);
  --cb-shine-3: transparent;
  --cb-surface: color-mix(in srgb, var(--surface) 82%, transparent);
  /* --surface2 isn't guaranteed by every Möbius theme; fall back
     to --surface so the sheet stays solid on themes that don't
     define the deeper surface token. */
  --cb-surface-strong: color-mix(in srgb, var(--surface2, var(--surface)) 92%, transparent);
  --cb-border: var(--border);
  --cb-land-fill: color-mix(in srgb, #d7c49a 72%, var(--surface) 28%);
  --cb-land-hover: color-mix(in srgb, #e5d4aa 78%, var(--text) 22%);
  --cb-land-stroke: color-mix(in srgb, #24333b 74%, var(--bg) 26%);
  /* Visited rides the theme's semantic --green (falls back to a stable
     green on themes that don't define it) so "visited" tracks per-theme
     accent shifts instead of pinning one hardcoded hue. */
  --cb-visited-base: var(--green, #27ae60);
  --cb-visited-fill: color-mix(in srgb, var(--cb-visited-base) 88%, var(--cb-land-fill) 12%);
  --cb-visited-stroke: color-mix(in srgb, #d9ffe7 72%, var(--bg) 28%);
  --cb-wishlist: color-mix(in srgb, #f39c12 88%, var(--cb-land-fill) 12%);
  --cb-wishlist-fill: color-mix(in srgb, var(--cb-wishlist) 82%, var(--cb-land-fill) 18%);
  /* Selected fill: the theme accent brightened with literal white — NOT
     --text, which flips dark on light themes and would read as shadow
     instead of highlight. The white lift keeps it clearly lighter than
     the visited green even on themes whose accent is itself green. */
  --cb-selected-fill: color-mix(in srgb, var(--accent) 72%, #ffffff 28%);
  --cb-active-cta-text: #101820;
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  /* App-root/page background is the plain theme token, matching every other
     Möbius app. The accent radial-gradient that used to sit here tinted the
     whole page; the globe carries its own scene (ocean gradient, accent halo)
     so the planet still reads as a planet without painting the chrome. */
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  overflow: hidden;
}

.cb-error {
  margin: 0 18px 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  font-size: 13px;
}
.cb-banner {
  margin: 0 18px 8px;
  padding: 8px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--cb-border);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
/* /mobius-ui:Root */

/* mobius-ui:Header v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  /* Top-pinned bar: clear the notch / status bar on phones. */
  padding: max(14px, env(safe-area-inset-top)) 18px 8px;
  flex-shrink: 0;
}
.cb-header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.01em;
  color: var(--text);
  min-width: 0;
  line-height: 1.15;
}
/* Rotating hero saying — flavor text, not a headline shout. Slightly softer
   weight/size than a title and truncated to one line so a longer phrase can't
   wrap into the meta chips. */
.cb-saying {
  font-size: 15px;
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Brand mark: the app's real glossy icon, no name text. The changing
   sentence ("12 stamps on the map.") sits beside it as status, not
   identity. */
.cb-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cb-brand-icon {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}
.cb-brand-fallback {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background: var(--accent, currentColor);
  color: var(--bg, #0c0c0c);
  font-weight: 700;
  line-height: 1;
}
.cb-header-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
@media (min-height: 760px) {
  .cb-header h1 { font-size: 20px; }
}
/* Wide screen: the bottom sheet doesn't really make sense, but
   since this is mobile-first we keep the layout consistent and
   just let the sheet sit at the bottom. The globe gets a bit of
   breathing room. */
@media (min-width: 720px) {
  .cb-header {
    padding: max(18px, env(safe-area-inset-top)) 24px 10px;
  }
}
@media (max-width: 430px) {
  .cb-header {
    align-items: center;
    padding: max(12px, env(safe-area-inset-top)) 14px 8px;
  }
  .cb-header h1 {
    font-size: 16px;
  }
  .cb-counter {
    padding: 5px 9px;
  }
}
/* /mobius-ui:Header */

/* mobius-ui:SyncPill v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-counter {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cb-surface) 88%, var(--bg) 12%);
  border: 1px solid var(--cb-border);
  /* Derived stats render in --mono to match how sibling apps set
     numeric/metadata chips. */
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  transition: opacity 200ms ease;
}
.cb-counter--faded {
  /* When we boot offline with no cached GeoJSON, the totals are
     unknown — fade the counter so the user doesn't read a
     confidently-stated "0 / …" as fact. */
  opacity: 0.55;
}
/* Balanced counter (Change 3): the visited count and the total now read at
   the SAME size and weight — the old design set 54 at 18px accent and /195 at
   13px muted, which made the pair look lopsided. Only color separates them
   (the current count picks up the accent; the divider + total sit in muted),
   so "54 / 195" reads as one tidy, even fraction. */
.cb-counter-now {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
}
.cb-counter-sep,
.cb-counter-total {
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
}
/* Sync pill — sits next to the counter; hidden when synced + online
   (the common case). When pending > 0 or offline, the pill softly
   announces what state the user's writes are in. */
.cb-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  /* Metadata chip: --mono + tabular-nums so the pending count reads as a
     derived stat, matching sibling apps. */
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid var(--cb-border);
  background: var(--cb-surface);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.cb-pill-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.cb-pill--offline .cb-pill-dot {
  background: color-mix(in srgb, var(--text) 50%, transparent);
}
/* /mobius-ui:SyncPill */

/* mobius-ui:Globe v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-globe-shell {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}
.cb-globe-canvas {
  position: absolute;
  inset: 0;
  /* touch-action:none on the container div prevents the shell zoom-lock
     from eating pinch gestures before the SVG's own touchAction:none
     takes effect — important during the first render frame. */
  touch-action: none;
}
.cb-globe-svg {
  width: 100%;
  height: 100%;
  display: block;
}
/* Suppress the outline only for mouse/touch focus; the shared Focus
   block below still paints a ring for keyboard (:focus-visible) users. */
.cb-globe-svg:focus:not(:focus-visible) {
  outline: none;
}
.cb-globe-svg g[role='button']:focus:not(:focus-visible) {
  outline: none;
}
/* The focused country may sit near or behind the limb where a thin
   stroke is easy to miss — pair a thick accent stroke with a
   non-scaling accent halo so keyboard focus is unmistakable. */
.cb-globe-svg g[role='button']:focus-visible {
  outline: none;
}
.cb-globe-svg g[role='button']:focus-visible .cb-country {
  stroke: var(--accent);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent));
}
.cb-globe-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 14px;
  text-align: center;
  padding: 0 24px;
}
.cb-globe-loading--offline {
  /* Sticks slightly above center so it doesn't overlap the bottom
     sheet's grip on short viewports. */
  align-items: start;
  padding-top: 28%;
}
.cb-country {
  fill: var(--cb-land-fill);
  stroke: var(--cb-land-stroke);
  stroke-width: 0.62;
  opacity: 1;
  transition: fill 180ms ease, stroke 180ms ease, opacity 180ms ease;
  cursor: pointer;
}
.cb-country--visited {
  fill: var(--cb-visited-fill);
  /* Stroke previously mixed accent with literal "white", which
     vanished the outline on light themes. Mix with --bg so the
     border keeps separation from the ocean in every theme. */
  stroke: var(--cb-visited-stroke);
  stroke-width: 0.74;
}
.cb-country--wishlist {
  fill: var(--cb-wishlist-fill);
  stroke: color-mix(in srgb, var(--cb-wishlist) 70%, var(--bg) 30%);
  stroke-width: 0.74;
}
.cb-country--selected {
  /* Selection highlights the TERRITORY, never its boundary. A stroke-based
     highlight can't work here: each country is one path, but countries
     paint in document order, so a neighbor drawn later overpaints the half
     of the selection stroke that falls on its side of a shared border (and
     redraws its own dark stroke on top) — the white outline showed up
     broken wherever the selected country touched land. A fill can't be
     overpainted (polygons tile), and because the whole MultiPolygon is one
     path keyed by iso3 the fill covers every island and exclave too.
     The country keeps its normal boundary stroke (land/visited/wishlist);
     only the fill changes — flat, no glow (owner feedback: drop-shadows
     read as smudge, and the accent+white fill is unambiguous on its own).
     Overrides visited/wishlist fill so the selection is always clear —
     the CTA state in the detail panel shows the status instead. */
  fill: var(--cb-selected-fill);
}
/* Status filter mirror — countries outside the active filter fade back so
   the matching set reads at a glance. Opacity (not a fill swap) keeps the
   visited/wishlist hue legible through the fade, and the dimmed paths stay
   tappable so the user can still select and mark them. */
.cb-country--dimmed {
  opacity: 0.3;
}
/* /mobius-ui:Globe */

/* mobius-ui:Sheet v1 — keep in sync; library candidate. Diverge below the marker only. */
.cb-sheet {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--cb-surface-strong);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--cb-border);
  border-radius: 22px 22px 0 0;
  /* Neutral elevation shadow — same in light + dark themes; the
     color-mix tint comes from the surface underneath. */
  box-shadow: 0 -10px 30px color-mix(in srgb, var(--text) 18%, transparent);
  /* Snap animations only — drag updates set the dragging class
     which disables the transition so the sheet tracks the finger
     without a perceived lag. */
  transition: height 220ms cubic-bezier(.22,1,.36,1);
  overflow: hidden;
  /* min-height previously used vh which conflicted with the
     percent-of-cb-app inline height during keyboard-up; drop
     the min entirely — SHEET_MIN (0.30) already enforces the
     floor in code. */
}
.cb-sheet--dragging {
  transition: none;
}
.cb-sheet-handle {
  /* Subtle grab affordance, not a band. The visible row is short (26px)
     to give the list back ~18px of vertical space (owner: the handle ate
     too much). The hit area stays finger-friendly because the handle's
     own padding plus the rounded sheet lip above it read as one target;
     the grip is centred in the 26px row. */
  flex-shrink: 0;
  height: 26px;
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: ns-resize;
}
.cb-sheet-grip {
  width: 34px;
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 20%, transparent);
}
.cb-sheet-search {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--cb-surface);
  border: 1px solid var(--cb-border);
  color: var(--muted);
}
.cb-sheet-search-icon {
  flex-shrink: 0;
  display: block;
  color: var(--muted);
}
.cb-sheet-search input {
  /* width:100% + box-sizing keeps the field a constant width as the user
     types — flex:1 alone let WebKit's intrinsic input sizing nudge the pill
     wider/narrower per character, so the search box visibly reflowed. */
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: transparent;
  border: 0;
  color: var(--text);
  font: inherit;
  /* Drop the native search affordance: type="search" paints WebKit's own
     ::-webkit-search-cancel-button, which doubled up with the app's custom
     clear button (two × glyphs). appearance:none removes the styled control
     so only the app's button shows. */
  appearance: none;
  -webkit-appearance: none;
}
/* Belt-and-braces: some WebKit builds still draw the cancel button even with
   appearance:none on the input, so hide the pseudo-element outright. */
.cb-sheet-search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.cb-sheet-search input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
/* Keep the borderless look for mouse focus; the shared Focus block
   still paints a keyboard ring on :focus-visible. */
.cb-sheet-search input:focus:not(:focus-visible) {
  outline: 0;
}
.cb-sheet-search input::placeholder {
  color: var(--muted);
}
.cb-sheet-search-clear {
  flex-shrink: 0;
  min-width: 28px;
  min-height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  border: 0;
  cursor: pointer;
}
/* /mobius-ui:Sheet */

/* Search + status-filter row above the list. The search pill flexes to
   fill; the chips keep fixed 44px touch targets. */
.cb-sheet-controls {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin: 4px 14px 10px;
}
.cb-filters {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
}
.cb-filter {
  width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 14px;
  border: 1px solid var(--cb-border);
  background: var(--cb-surface);
  color: var(--muted);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
}
.cb-filter:active {
  transform: scale(0.94);
}
.cb-filter.is-on {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--accent);
}
@media (hover: hover) {
  .cb-filter:hover { color: var(--text); }
  .cb-filter.is-on:hover { color: var(--accent); }
}

/* mobius-ui:Card v1 — keep in sync; library candidate. Diverge below the marker only. */
/* Detail panel and list panel sit in the same flex slot. Exactly one
   is visible at a time; the other is display:none so it takes no space
   but stays mounted — this is the mechanism that preserves scrollTop on
   the list without any JS save/restore logic. */
.cb-detail--hidden,
.cb-list-panel--hidden {
  display: none !important;
}
.cb-list-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
/* Detail view — shown while a country is selected. Three bands: a fixed
   condensed header, a single scrollable body, and a pinned action bar. The
   detail itself does NOT scroll (only .cb-detail-body does), so the header and
   CTAs never leave the screen and nothing clips at any sheet height. Kept
   mounted at all times so toggling back to the list never resets scrollTop. */
.cb-detail {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden; /* the body scrolls, not the shell */
}
/* Condensed header — pinned at the top of the detail. A hairline divider sets
   it off from the scrolling facts; the negative-free padding keeps the flag,
   name and close on one tidy 56px-ish row that survives the shortest sheet. */
.cb-detail-head {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 6px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--cb-border) 70%, transparent);
}
.cb-detail-flag {
  /* Smaller than the old 40px block: the header is a label now, not a hero, so
     the facts below get the room. */
  font-size: 30px;
  line-height: 1;
}
.cb-detail-name {
  min-width: 0; /* let the name ellipsize instead of pushing the close button off */
}
.cb-detail-name strong {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cb-detail-name small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* The one scrolling region. Sits between the fixed header and the pinned
   action bar; only this band overflows, so the facts can grow without
   clipping and without dragging the CTAs off-screen. */
.cb-detail-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 16px;
}
/* Basic-info card (Change 6) — a definition list of capital / population /
   surface area / languages. Label muted, value in --text; rows separated by a
   hairline so the four facts read as a tidy table without heavy borders. */
.cb-info {
  margin: 0;
  /* Don't let the flex body squeeze the facts card: when the sheet is dragged
     very short the body must scroll, not crush the card to a sliver. shrink:0
     keeps the card at its natural height so .cb-detail-body overflows (and
     scrolls) instead of clipping the rows. */
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--cb-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 50%, transparent);
  overflow: hidden;
}
.cb-info-row {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr);
  align-items: baseline;
  gap: 14px;
  padding: 10px 14px;
}
.cb-info-row + .cb-info-row {
  border-top: 1px solid color-mix(in srgb, var(--cb-border) 60%, transparent);
}
.cb-info-row dt {
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.cb-info-row dd {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  text-align: right;
  /* Numeric facts (population/area) align as derived stats, matching the
     counter chip's tabular treatment. */
  font-variant-numeric: tabular-nums;
  word-break: break-word;
}
.cb-detail-close {
  min-width: 44px;
  min-height: 44px;
  display: grid;
  place-items: center;
  padding: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 80%, transparent);
  color: var(--muted);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 120ms ease;
}
.cb-detail-cta {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: color-mix(in srgb, var(--surface2, var(--surface)) 88%, transparent);
  color: var(--text);
  border: 1px solid var(--cb-border);
  cursor: pointer;
  transition: transform 120ms ease, background 160ms ease, color 160ms ease;
}
/* Pinned action bar — flex-shrink:0 keeps it on-screen while the facts scroll.
   The top divider + surface tint read it as a footer; the safe-area inset (now
   that the shell dropped its own padding) keeps the CTAs clear of the home
   indicator on notched phones. */
.cb-detail-actions {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 12px 16px max(14px, env(safe-area-inset-bottom));
  border-top: 1px solid color-mix(in srgb, var(--cb-border) 70%, transparent);
  background: color-mix(in srgb, var(--cb-surface-strong) 70%, transparent);
}
.cb-detail-cta:active {
  transform: scale(0.985);
}
.cb-detail-cta--visited.is-on {
  background: var(--cb-visited-fill);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-visited-fill);
}
.cb-detail-cta--wishlist.is-on {
  background: var(--cb-wishlist);
  color: var(--cb-active-cta-text);
  border-color: var(--cb-wishlist);
}
.cb-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* Bottom-most surface: keep the last row clear of the home
     indicator / gesture bar on notched phones. */
  padding: 0 12px max(18px, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
.cb-list-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}
.cb-row {
  /* Min-height enforces a 44px tap target without needing to
     pad the row visually — the grid keeps content centred. */
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 120ms ease;
}
.cb-row:active {
  transform: scale(0.995);
}
.cb-row-flag {
  font-size: 22px;
  line-height: 1;
}
.cb-row-text strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
}
.cb-row-text small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
}
/* Two one-tap toggles per row, side by side (Change 5): the star =
   'Want to go', the ring = 'Been'. The group is the row's third grid column. */
.cb-row-marks {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
/* 'Want to go' star toggle — wishlist orange when on, hollow when off.
   Same 40px hit target as the visited ring so the two read as a pair. */
.cb-row-want {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  margin: -8px -2px -8px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  font-size: 20px;
  line-height: 1;
  color: color-mix(in srgb, var(--muted) 80%, transparent);
  transition: color 0.12s, transform 0.08s;
}
.cb-row-want--on {
  color: var(--cb-wishlist);
}
.cb-row-want:active { transform: scale(0.88); }
@media (hover: hover) {
  .cb-row-want:hover { color: var(--cb-wishlist); }
}
/* One-tap visited toggle on each list row: mark a country without opening
   its detail (tap stops propagation). 40px hit target around a 26px ring;
   fills accent with a check when visited. The owner's core flow is bulk-
   marking 195 countries, so this turns "row → detail → mark → back" into a
   single tap. */
.cb-row-mark {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  margin: -8px -4px -8px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  color: var(--cb-visited-fill, var(--accent));
}
.cb-row-mark > span {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  line-height: 1;
  transition: background 0.12s, border-color 0.12s, transform 0.08s;
}
.cb-row-mark--on > span {
  background: var(--cb-visited-fill, var(--accent));
  border-color: var(--cb-visited-fill, var(--accent));
  color: var(--bg);
}
.cb-row-mark:active > span { transform: scale(0.88); }
@media (hover: hover) {
  .cb-row-mark:hover > span { border-color: var(--cb-visited-fill, var(--accent)); }
}
.cb-row--visited .cb-row-text strong {
  color: var(--cb-visited-fill);
}
.cb-row--wishlist {
  border-color: color-mix(in srgb, var(--cb-wishlist) 22%, transparent);
  background: color-mix(in srgb, var(--cb-wishlist) 8%, var(--surface));
}
.cb-row--wishlist .cb-row-text strong {
  color: var(--cb-wishlist);
}
/* /mobius-ui:Card */

/* mobius-ui:Scrollskin v1 — keep in sync; library candidate. Slim
   token-colored scrollbar so desktop/web doesn't fall back to the raw
   OS default the mobile-first layout otherwise shows on wide screens. */
.cb-list, .cb-detail-body {
  scrollbar-width: thin;
  scrollbar-color: var(--cb-border) transparent;
}
.cb-list::-webkit-scrollbar, .cb-detail-body::-webkit-scrollbar {
  width: 9px;
}
.cb-list::-webkit-scrollbar-track, .cb-detail-body::-webkit-scrollbar-track {
  background: transparent;
}
.cb-list::-webkit-scrollbar-thumb, .cb-detail-body::-webkit-scrollbar-thumb {
  background: var(--cb-border);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
/* /mobius-ui:Scrollskin */

/* mobius-ui:ReducedMotion v1 -- honor the OS reduce-motion setting */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
/* /mobius-ui:ReducedMotion */
`

export default function Atlas({ appId, token }) {
  const storage = useMemo(() => makeStorage({ appId, token }), [appId, token])

  const [countries, setCountries] = useState([])
  const [visited, setVisited] = useState(() => new Set())
  const [wishlist, setWishlist] = useState(() => new Set())
  const [selectedIso3, setSelectedIso3] = useState('')
  const [query, setQuery] = useState('')
  // Status filter (all / visited / wishlist) — persisted per device via the
  // localStorage cache (it's a view preference, not data worth a server
  // round-trip), restored on boot so the list opens the way it was left.
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = cacheRead(appId, 'status-filter')
    return STATUS_FILTERS.includes(saved) ? saved : 'all'
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Track online status so the SyncPill can announce offline mode.
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  )
  // Distinguishes "fetched empty list" from "couldn't fetch at all". When
  // offline, storage.get returns null; the boot path flips this flag so we
  // can render an "offline — using last-known state" banner instead of
  // pretending the world has zero countries.
  const [offlineBoot, setOfflineBoot] = useState(false)
  // Did we manage to render anything for the user? Drives the offline banner
  // copy — "showing your last visited list" only when we actually have one.
  const [hasCachedVisited, setHasCachedVisited] = useState(false)

  // Hero saying (Change 4) — replaces the old big visited count, which just
  // duplicated the visited stamps already on the map. ONE line is picked at
  // random on mount and stays fixed for the session: no interval, so it never
  // re-rolls under the user's eyes (a changing line read as a glitch — owner
  // feedback). useState's initializer runs once per mount, which IS the
  // pick-once; a fresh pick only happens when the app is re-opened. An empty
  // ROTATING_SAYINGS array yields index -1 and the header renders no line.
  const [sayingIndex] = useState(() => pickRotatingSaying(ROTATING_SAYINGS, -1))
  const heroSaying = sayingIndex >= 0 ? ROTATING_SAYINGS[sayingIndex] : ''

  // ----- boot ----------------------------------------------------------
  // boot() lives outside the effect so we can re-run it from the online
  // listener below — offline cold-reload that later connects shouldn't be
  // stuck on the empty state forever.
  const bootInFlightRef = useRef(false)
  const boot = useCallback(async () => {
    if (bootInFlightRef.current) return
    bootInFlightRef.current = true
    try {
      setLoading(true)
      // Promise.allSettled, not Promise.all — when only one side fails we
      // still want to keep the side that succeeded (Promise.all discards
      // both on any failure, which used to wipe the visited list when the
      // countries fetch hiccupped).
      const [countriesResult, visitedResult, wishlistResult] = await Promise.allSettled([
        storage.get('countries.geo.json'),
        storage.get('visited.json'),
        storage.get('wishlist.json'),
      ])
      const rawCountries =
        countriesResult.status === 'fulfilled' ? countriesResult.value : null
      const rawVisited =
        visitedResult.status === 'fulfilled' ? visitedResult.value : null
      const rawWishlist =
        wishlistResult.status === 'fulfilled' ? wishlistResult.value : null

      // Countries: prefer fresh, fall back to local cache, dedupe by iso3.
      const cachedCountries = cacheRead(appId, 'countries.geo.json')
      const freshCountries = Array.isArray(rawCountries) ? rawCountries : null
      const countriesList = dedupeCountries(freshCountries || cachedCountries || [])
      setCountries(countriesList)
      if (freshCountries) cacheWrite(appId, 'countries.geo.json', freshCountries)

      // Visited countries: prefer fresh, fall back to local cache.
      const cachedVisited = cacheRead(appId, 'visited.json')
      const freshVisited = Array.isArray(rawVisited) ? rawVisited : null
      const visitedList = freshVisited || cachedVisited || []
      const cachedWishlist = cacheRead(appId, 'wishlist.json')
      const freshWishlist = Array.isArray(rawWishlist) ? rawWishlist : null
      const wishlistList = freshWishlist || cachedWishlist || []
      let nextVisited = new Set(visitedList)
      let nextWishlist = new Set(wishlistList.filter((iso3) => !nextVisited.has(iso3)))
      // Don't clobber in-progress offline toggles. If the runtime outbox
      // still has unsynced writes (pendingCount > 0), the server copy we
      // just read is older than the user's local taps — replacing state
      // with it would wipe visited/wishlist toggles made while offline.
      // Union the server set with the local in-progress sets instead, with
      // visited winning over wishlist (the same exclusivity the toggles use).
      let unsynced = 0
      try {
        unsynced = await storage.pendingCount()
      } catch {
        unsynced = 0
      }
      if (unsynced > 0) {
        nextVisited = new Set([...nextVisited, ...latestVisitedRef.current])
        nextWishlist = new Set(
          [...nextWishlist, ...latestWishlistRef.current].filter((iso3) => !nextVisited.has(iso3)),
        )
      }
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      // Mirror the state we actually set (the unioned set when we preserved
      // in-progress toggles), not the raw server copy — otherwise the next
      // cold start would read a cache that's missing the offline toggles.
      if (freshVisited) cacheWrite(appId, 'visited.json', Array.from(nextVisited))
      if (freshWishlist) cacheWrite(appId, 'wishlist.json', Array.from(nextWishlist))
      setHasCachedVisited((freshVisited || cachedVisited || []).length > 0)

      // If we ended up with zero countries AND the network is offline, the
      // banner is honest: "offline, here's what we cached". If we have
      // countries (from cache or net), no banner.
      const isOffline =
        typeof navigator !== 'undefined' && navigator.onLine === false
      setOfflineBoot(countriesList.length === 0 && isOffline)

      if (countriesList.length === 0 && !isOffline) {
        // Online but we got nothing — flag a real error so the user knows
        // to try again instead of staring at an empty globe.
        setError('Could not load the world right now. Try again in a moment.')
      } else {
        setError('')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Atlas:boot failed', err)
      setError('Could not load the world right now. Try again in a moment.')
    } finally {
      setLoading(false)
      bootInFlightRef.current = false
    }
  }, [appId, storage])

  useEffect(() => {
    boot().catch(() => {})
  }, [boot])

  // Online/offline tracking. We listen to the browser events directly —
  // the runtime doesn't proxy them.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const refresh = () => setOnline(navigator.onLine !== false)
    refresh()
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [])

  // When the browser reconnects after an offline cold-start, retry boot
  // so the empty globe gets populated. boot() is idempotent and guards
  // against parallel runs via bootInFlightRef.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onOnline = () => {
      // Only retry boot if we still don't have countries — otherwise we'd
      // wipe the user's view every reconnect.
      if (countries.length === 0) boot().catch(() => {})
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [boot, countries.length])

  // ----- derived list (ordered, then narrowed) --------------------------
  // Order is alphabetical and never depends on marking — see
  // orderCountriesForList. The status filter narrows; it doesn't re-sort.
  const filteredCountries = useMemo(() => {
    const ordered = orderCountriesForList(countries, query)
    return filterCountriesByStatus(ordered, statusFilter, visited, wishlist)
  }, [countries, query, statusFilter, visited, wishlist])

  const changeStatusFilter = useCallback(
    (next) => {
      if (!STATUS_FILTERS.includes(next)) return
      setStatusFilter(next)
      cacheWrite(appId, 'status-filter', next)
    },
    [appId],
  )

  const visitedCount = visited.size
  const totalCount = countries.length

  // ----- nav state machine --------------------------------------------
  // navStateRef holds the current state without forcing a re-render; the
  // user-visible state is selectedIso3. closeRequestedRef flags "the user
  // closed while we were still PUSHING" — when the ACK eventually lands
  // it'll auto-emit nav-pop instead of stranding a phantom entry on the
  // shell's back-stack.
  const navStateRef = useRef(NAV_IDLE)
  const closeRequestedRef = useRef(false)
  const pendingRequestIdRef = useRef('')
  const ackHandlerRef = useRef(null)
  const ackTimerRef = useRef(0)

  const clearPendingAck = useCallback(() => {
    if (ackTimerRef.current) {
      clearTimeout(ackTimerRef.current)
      ackTimerRef.current = 0
    }
    if (ackHandlerRef.current) {
      window.removeEventListener('message', ackHandlerRef.current)
      ackHandlerRef.current = null
    }
    pendingRequestIdRef.current = ''
  }, [])

  const installAckHandler = useCallback(() => {
    if (typeof window === 'undefined') return
    if (ackHandlerRef.current) return // already installed
    const handler = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      if (!pendingRequestIdRef.current) return
      if (event.data?.requestId !== pendingRequestIdRef.current) return
      if (event.data.type !== 'moebius:nav-push-ack' && event.data.type !== 'moebius:nav-push-rejected') return
      const accepted = event.data.type === 'moebius:nav-push-ack'
      clearPendingAck()
      if (!accepted) {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
        return
      }
      // ACK landed. What we do depends on whether the user already closed.
      if (navStateRef.current === NAV_PUSHING && closeRequestedRef.current) {
        // User closed before the ACK. Auto-pop so the back-stack stays
        // consistent and the late ACK doesn't strand a phantom entry.
        closeRequestedRef.current = false
        try {
          window.parent?.postMessage(
            { type: 'moebius:nav-pop' },
            window.location.origin,
          )
        } catch {
          // Older shell — no harm done.
        }
        navStateRef.current = NAV_IDLE
      } else if (navStateRef.current === NAV_PUSHING) {
        navStateRef.current = NAV_OPEN
      }
      // If we're already IDLE or POPPING by the time the ACK arrives,
      // ignore it — the state machine has already moved on.
    }
    window.addEventListener('message', handler)
    ackHandlerRef.current = handler
  }, [clearPendingAck])

  const navPush = useCallback(() => {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return
    if (navStateRef.current !== NAV_IDLE) return
    const requestId = `visited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    pendingRequestIdRef.current = requestId
    closeRequestedRef.current = false
    navStateRef.current = NAV_PUSHING
    installAckHandler()
    ackTimerRef.current = window.setTimeout(() => {
      clearPendingAck()
      if (navStateRef.current === NAV_PUSHING) {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
      }
    }, 5000)
    try {
      window.parent.postMessage(
        { type: 'moebius:nav-push', label: 'atlas-detail', requestId },
        window.location.origin,
      )
    } catch {
      // No shell — clear pending so we don't sit in PUSHING forever.
      clearPendingAck()
      navStateRef.current = NAV_IDLE
      setSelectedIso3('')
    }
  }, [clearPendingAck, installAckHandler])

  const navPop = useCallback(() => {
    if (typeof window === 'undefined' || !window.parent) return
    if (navStateRef.current === NAV_OPEN) {
      navStateRef.current = NAV_POPPING
      try {
        window.parent.postMessage(
          { type: 'moebius:nav-pop' },
          window.location.origin,
        )
      } catch {
        // Older shell — selection still clears locally.
      }
      navStateRef.current = NAV_IDLE
    } else if (navStateRef.current === NAV_PUSHING) {
      // Close happened before ACK; flag so the ACK handler auto-pops.
      closeRequestedRef.current = true
    }
    // From IDLE / POPPING: nothing to do.
  }, [])

  const deselect = useCallback(() => {
    setSelectedIso3('')
    navPop()
  }, [navPop])

  // Listen for shell back-button events. The shell emits moebius:nav-back
  // when the user swipes/taps back while we own a stack entry; clear
  // selection without echoing another nav-pop (the shell already popped).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return
      if (event.source !== window.parent) return
      if (event.data?.type === 'moebius:nav-back') {
        navStateRef.current = NAV_IDLE
        closeRequestedRef.current = false
        setSelectedIso3('')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Unmount: tear down any in-flight ACK listener so a late message
  // doesn't reach a dead component. If we still own a back-stack entry,
  // pop it so the shell doesn't keep a phantom around.
  useEffect(() => {
    return () => {
      if (ackHandlerRef.current) {
        window.removeEventListener('message', ackHandlerRef.current)
        ackHandlerRef.current = null
      }
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current)
        ackTimerRef.current = 0
      }
      if (navStateRef.current === NAV_OPEN || navStateRef.current === NAV_PUSHING) {
        try {
          window.parent?.postMessage(
            { type: 'moebius:nav-pop' },
            window.location.origin,
          )
        } catch {
          // No shell — no-op.
        }
      }
      navStateRef.current = NAV_IDLE
      closeRequestedRef.current = false
      pendingRequestIdRef.current = ''
    }
  }, [])

  // ----- serialized save queue ----------------------------------------
  // The whole-list PUT model means rapid taps on different countries used
  // to fire parallel PUTs; tap B could land before tap A, then A's
  // rollback wiped B's correct value (or vice versa). We now serialize
  // PUTs through a single in-flight Promise — every save waits its turn.
  // Pending writes coalesce on the LATEST visited/wishlist Sets (last-writer-wins),
  // which is exactly the "merge multiple taps into one PUT" behaviour
  // the user expects when they're rapid-firing through Europe.
  const saveChainRef = useRef(Promise.resolve())
  const latestVisitedRef = useRef(visited)
  const latestWishlistRef = useRef(wishlist)
  useEffect(() => {
    latestVisitedRef.current = visited
  }, [visited])
  useEffect(() => {
    latestWishlistRef.current = wishlist
  }, [wishlist])
  // Coalesce flag — if multiple taps land while one PUT is in flight, we
  // only kick off ONE follow-up PUT (using the latest visited Set) when
  // the in-flight one settles.
  const pendingSaveRef = useRef(false)

  const queueSave = useCallback(
    (countryForErr) => {
      // Mark a follow-up; if a save was already pending, no need to add
      // another link — the existing tail will pick up latestVisitedRef.
      if (pendingSaveRef.current) return
      pendingSaveRef.current = true
      saveChainRef.current = saveChainRef.current
        .catch(() => {}) // swallow prior errors so the chain keeps moving
        .then(async () => {
          pendingSaveRef.current = false
          const visitedSnapshot = Array.from(latestVisitedRef.current)
          const wishlistSnapshot = Array.from(latestWishlistRef.current)
          try {
            await storage.set('visited.json', visitedSnapshot)
            await storage.set('wishlist.json', wishlistSnapshot)
            cacheWrite(appId, 'visited.json', visitedSnapshot)
            cacheWrite(appId, 'wishlist.json', wishlistSnapshot)
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Atlas:save failed', err)
            // We can't safely "roll back" here because the user has likely
            // toggled OTHER countries in the meantime — restoring a stale
            // snapshot would clobber their newer taps. Instead surface an
            // error; the next online tick will re-sync from the server.
            setError(
              countryForErr
                ? `Could not save ${countryForErr.displayName} just now — try again in a moment.`
                : 'Could not save your changes just now — try again in a moment.',
            )
          }
        })
    },
    [appId, storage],
  )

  // Optimistic toggle: flip the local Set immediately so the toggle feels
  // instant, then queue a save against the LATEST state. We do NOT roll
  // back per-tap because rapid taps would fight each other on rollback —
  // see queueSave for the error-handling rationale.
  const toggleVisited = useCallback(
    (country) => {
      if (!country) return
      setError('')
      const { visited: nextVisited, wishlist: nextWishlist } = toggleCountryStatus(
        latestVisitedRef.current,
        latestWishlistRef.current,
        country.iso3,
        'visited',
      )
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      queueSave(country)
    },
    [queueSave],
  )

  const toggleWishlist = useCallback(
    (country) => {
      if (!country) return
      setError('')
      const { visited: nextVisited, wishlist: nextWishlist } = toggleCountryStatus(
        latestVisitedRef.current,
        latestWishlistRef.current,
        country.iso3,
        'wishlist',
      )
      latestVisitedRef.current = nextVisited
      latestWishlistRef.current = nextWishlist
      setVisited(nextVisited)
      setWishlist(nextWishlist)
      queueSave(country)
    },
    [queueSave],
  )

  // Tap on globe OR list row — select + open detail view. NEVER
  // toggles. The detail view's primary CTA is the only path to commit
  // a visited/not-visited change.
  const selectCountry = useCallback(
    (country) => {
      if (!country) return
      setSelectedIso3(country.iso3)
      navPush()
    },
    [navPush],
  )

  const selectedCountry = useMemo(
    () => (selectedIso3 ? countries.find((c) => c.iso3 === selectedIso3) || null : null),
    [countries, selectedIso3],
  )

  // ----- render --------------------------------------------------------
  return (
    <div className="cb-app">
      <style>{CSS}</style>

      <header className="cb-header">
        <div className="cb-brand">
          {/* The app's own glossy icon as the brand mark (downscaled +
              cached); the accent dot is the fallback when this install has
              no custom icon and the route 404s. */}
          <img
            src={`/api/apps/${appId}/icon?size=64`}
            alt=""
            width={34}
            height={34}
            className="cb-brand-icon"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const f = e.currentTarget.nextElementSibling
              if (f) f.style.display = 'flex'
            }}
          />
          <span className="cb-brand-fallback" style={{ display: 'none' }} aria-hidden="true">·</span>
          {/* Rotating hero saying (Change 4). The old "N stamps on the map."
              count duplicated the visited stamps already on the globe AND the
              counter chip on the right; a rotating short line replaces it. When
              ROTATING_SAYINGS is emptied heroSaying is '' and the <h1> is
              omitted entirely — clearing the list cleanly removes the line. */}
          {heroSaying ? <h1 className="cb-saying">{heroSaying}</h1> : null}
        </div>
        <div className="cb-header-meta">
          <SyncPill online={online} hasRuntime={storage.hasRuntime()} />
          {/* The single source of progress now: a balanced "visited / total"
              chip (both numbers the same weight — see .cb-counter). The hero
              line is flavor; this is the number. */}
          <div
            className={'cb-counter' + (offlineBoot ? ' cb-counter--faded' : '')}
            aria-label={`${visitedCount} of ${totalCount} countries visited`}
          >
            <span className="cb-counter-now">{visitedCount}</span>
            <span className="cb-counter-sep" aria-hidden="true">/</span>
            <span className="cb-counter-total">{totalCount || '…'}</span>
          </div>
        </div>
      </header>

      {offlineBoot ? (
        <div className="cb-banner" role="status">
          {hasCachedVisited
            ? "You're offline — showing your last visited list. The globe and full country list come back when you're online again."
            : "You're offline and we don't have a cached copy yet. Connect once and this app works offline forever after."}
        </div>
      ) : null}

      {error ? (
        <div className="cb-error" role="alert" aria-live="polite">
          {error}
        </div>
      ) : null}

      <div className="cb-globe-shell">
        {loading ? (
          <div className="cb-globe-loading">Loading the world…</div>
        ) : (
          <Globe
            countries={countries}
            visited={visited}
            wishlist={wishlist}
            selectedIso3={selectedIso3}
            statusFilter={statusFilter}
            onTapCountry={selectCountry}
            onTapOcean={deselect}
          />
        )}
      </div>

      <BottomSheet
        countries={filteredCountries}
        visited={visited}
        wishlist={wishlist}
        selectedCountry={selectedCountry}
        query={query}
        statusFilter={statusFilter}
        onQueryChange={setQuery}
        onFilterChange={changeStatusFilter}
        onSelect={selectCountry}
        onToggleVisited={toggleVisited}
        onToggleWishlist={toggleWishlist}
        onDeselect={deselect}
      />
    </div>
  )
}
