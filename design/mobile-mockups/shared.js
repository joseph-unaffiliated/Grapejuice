const IMG = (slug, hash) => `https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/catalog/hanukkah/items/${slug}/primary-0-${hash}.webp`;
/* Secondary product photography from the live galleries, plus the box-on-the-doorstep shot for gifting. */
const OTHER = (slug, i, hash) => `https://storage.googleapis.com/grapejuice-pilot.firebasestorage.app/catalog/hanukkah/items/${slug}/other-${i}-${hash}.webp`;
const PHOTO = {
  lighting: OTHER('welcome-menorah', 0, '3c3016563f6d'),
  bedroom:  OTHER('welcome-menorah', 2, 'b05716caf10b'),
  stemless: OTHER('stemless-menorah', 0, 'a76794d984d6'),
  latkes:   OTHER('latke-kit', 1, 'de00e3bb9692'),
  drawing:  OTHER('draw-your-own-dreidel', 0, '9f3b926900a3'),
  rolling:  OTHER('roll-your-own-beeswax-candles', 0, '50c65133bfe8'),
  beeswax:  OTHER('beeswax-candles', 0, '245ee482e66e'),
  clay:     OTHER('airdry-clay-dreidel', 0, '59b560faeeb1'),
  brass:    OTHER('solid-brass-dreidel', 1, 'a9e2d5ccc85a'),
  cutters:  OTHER('dreidel-cookie-cutters', 0, '4b38cc23e022'),
  shamash:  OTHER('shamash-the-menorah-stuffie', 1, 'b0d3c7abefe6'),
  shamashKid: OTHER('shamash-the-menorah-stuffie', 0, '4a1e7d933500'),
  crispy:   OTHER('crispy-the-latke-stuffie', 0, 'b74315f8a753'),
  jelly:    OTHER('jelly-the-sufganiyah-stuffie', 0, '9effe4ee09be'),
  gimmel:   OTHER('gimmel-the-dreidel-stuffie', 0, '64e6aa6d9fd5'),
  dragon:   OTHER('book-a-dragon-for-hanukkah', 0, 'c7f95ad3910c'),
  doorstep: 'img/box-doorstep.jpg',
};
const KID = new URLSearchParams(location.search).get('kid') || 'Sam';
const BASE = 80;

const I = {
  beeswax:    { name: 'Beeswax Candles', img: IMG('beeswax-candles', '78fff2e2d535'), price: 5 },
  ryo:        { name: 'Roll Your Own Beeswax Candles', short: 'Roll Your Own', img: IMG('roll-your-own-beeswax-candles', '4b988bedc8c0'), price: 6, swap: true },
  electric:   { name: 'Electric Candles', short: 'Electric', img: IMG('electric-candles', '46528cb93abe'), price: 9, swap: true },
  arch:       { name: '"Arch" Menorah', img: IMG('arch-menorah', 'e116f8afb010'), price: 80 },
  branches:   { name: '"Branches" Menorah', img: IMG('branches-menorah', '1c67461e0e3e'), price: 80 },
  slab:       { name: '"Slab" Menorah', img: IMG('slab-menorah', '873a5970b249'), price: 80 },
  stemless:   { name: '"Stemless" Menorah', img: IMG('stemless-menorah', '3bea4b23863f'), price: 100 },
  wooden:     { name: 'Classic Wooden Dreidel', short: 'Classic Wooden', img: IMG('classic-wooden-dreidel', '95a5505c4817'), price: 3 },
  draw:       { name: 'Draw Your Own Dreidel', short: 'Draw Your Own', img: IMG('draw-your-own-dreidel', 'cee5b3576b2c'), price: 1, swap: true },
  clay:       { name: 'Airdry Clay Dreidel', short: 'Airdry Clay', img: IMG('airdry-clay-dreidel', '115dc51fb643'), price: 3, swap: true,
                desc: '“I had a little dreidel, I made it out of clay.” Now you can! No kiln necessary. Practice letters, come up with your own style, and see if you can make one that spins.' },
  brass:      { name: 'Solid Brass Dreidel', img: IMG('solid-brass-dreidel', 'dee9d2804eb9'), price: 30,
                desc: 'Elegant enough for the shelf; functional enough to play when Hanukkah rolls around.' },
  slipcast:   { name: 'Slipcast Dreidel', img: IMG('slipcast-dreidel', 'b7c0165cf264'), price: 30 },
  biggelt:    { name: 'Big Bag of Gelt', short: 'Big Bag', img: IMG('big-bag-of-gelt', 'dd5a8995f6df'), price: 10 },
  littlegelt: { name: 'Little Bag of Gelt', short: 'Little Bag', img: IMG('little-bag-of-gelt-2-big-5-little', 'e020ed00343a'), price: 2, swap: true },
  partygelt:  { name: 'Party Bag of Gelt', img: IMG('party-bag-of-gelt', 'cd31723ee4ad'), price: 18 },
  latke:      { name: 'Latke Kit', img: IMG('latke-kit', 'fad2029b3c90'), price: 5 },
  sufg:       { name: 'Sufganiyot Kit', img: IMG('sufganiyot-kit', '718a61f3f02c'), price: 5 },
  cutters:    { name: 'Dreidel Cookie Cutters', img: IMG('dreidel-cookie-cutters', '097c6b2c271a'), price: 4 },
  dragon:     { name: 'A Dragon for Hanukkah', short: 'A Dragon for Hanukkah', img: IMG('book-a-dragon-for-hanukkah', '6fb8f132591b'), price: 19 },
  rugrats:    { name: 'A Rugrats Chanukah', short: 'Rugrats', img: IMG('book-a-rugrats-chanukah', 'd4f9e89a4af2'), price: 17, swap: true },
  charlie:    { name: "Charlie and Seymour's Hanukkah Miracle", short: 'Charlie & Seymour', img: IMG('book-charlie-and-seymour-s-hanukkah-miracle', '56367c502cd7'), price: 11, swap: true },
  clifford:   { name: 'Clifford Celebrates Hanukkah', short: 'Clifford', img: IMG('book-clifford-celebrates-hanukkah', 'e43b4792a446'), price: 6, swap: true },
  shamash:    { name: 'Shamash, the Menorah Stuffie', short: 'Shamash', img: IMG('shamash-the-menorah-stuffie', '44664be67966'), price: 10,
                desc: 'Shamash is a plush menorah soft toy named for the helper candle, made for cuddles and pretend candle-lighting, not open flame.' },
  crispy:     { name: 'Crispy, the Latke Stuffie', short: 'Crispy', img: IMG('crispy-the-latke-stuffie', '0761f62e2967'), price: 10, swap: true },
  jelly:      { name: 'Jelly, the Sufganiyah Stuffie', short: 'Jelly', img: IMG('jelly-the-sufganiyah-stuffie', 'a53b86d06b55'), price: 10, swap: true,
                desc: 'Jelly is a soft, round sufganiyah stuffie with a red jelly dot on top. Made for cuddles and pretend frying.' },
  gimmel:     { name: 'Gimmel, the Dreidel Stuffie', short: 'Gimmel', img: IMG('gimmel-the-dreidel-stuffie', '27b546d04d51'), price: 10, swap: true },
  lego:       { name: '"Lego" Menorah', img: IMG('lego-menorah', '48a9b1e33728'), price: 15, badge: 'Low stock',
                desc: 'What better way to bring in the holiday than to build your own hanukkiah?' },
  claymenorah:{ name: 'Airdry Clay Menorah', img: IMG('airdry-clay-menorah', '8d5f08505c96'), price: 10 },
  wrapping:   { name: 'Wrapping Paper', img: IMG('wrapping-paper', '2cd6d895fe3c'), price: 5 },
};

const GROUPS = [
  { id: 'candles', title: 'Light the Candles', short: 'Candles', line: 'One more candle each night, plus the shamash.',
    slots: [{ id: 'candles', label: 'Candles', def: 'beeswax', inc: 1, alts: ['ryo', 'electric'] }],
    extras: ['arch', 'branches', 'slab', 'stemless'], extrasLabel: 'Add a menorah for the grown-ups' },
  { id: 'dreidel', title: 'Play Dreidel', short: 'Dreidel', line: 'One dreidel per person, and gelt to play for.',
    slots: [
      { id: 'dreidel', label: 'Dreidels', def: 'wooden', inc: 2, incNote: '1 per person', alts: ['draw', 'clay'] },
      { id: 'gelt', label: 'Gelt', def: 'biggelt', inc: 1, alts: ['littlegelt'] }],
    extras: ['brass', 'slipcast', 'partygelt'], extrasLabel: 'Upgrade the game' },
  { id: 'eat', title: 'Eat & Drink', short: 'Eat', line: 'Latkes and sufganiyot, fried at home.',
    slots: [
      { id: 'latke', label: 'Latkes', def: 'latke', inc: 1, alts: [] },
      { id: 'sufg', label: 'Sufganiyot', def: 'sufg', inc: 1, alts: [] }],
    extras: ['cutters', 'partygelt', 'crispy', 'jelly'], extrasLabel: 'Add to the table' },
  { id: 'story', title: 'Tell the Story', short: 'Story', line: `A book to read together, picked for ${KID}'s age.`,
    slots: [{ id: 'book', label: `Book for ${KID}`, def: 'dragon', inc: 1, kid: true, alts: ['charlie', 'rugrats', 'clifford'] }],
    extras: ['charlie', 'rugrats', 'clifford'], extrasLabel: 'Add another book' },
  { id: 'gifts', title: `Gifts for ${KID}`, short: 'Gifts', line: 'One present for each kid, wrapped or ready to wrap.', gift: true,
    slots: [
      { id: 'gift', label: `Gift for ${KID}`, def: 'shamash', inc: 1, kid: true, alts: ['crispy', 'jelly', 'gimmel'] },
      { id: 'wrap', label: 'Wrapping', def: 'wrapping', inc: 1, alts: [] }],
    extras: ['lego', 'claymenorah', 'clay', 'jelly'], extrasLabel: `More presents for ${KID}` },
];
const SLOTS = Object.fromEntries(GROUPS.flatMap(g => g.slots.map(s => [s.id, { ...s, group: g.id }])));

function initState(params) {
  const S = {
    pick: Object.fromEntries(Object.values(SLOTS).map(s => [s.id, s.def])),
    qty: Object.fromEntries(Object.values(SLOTS).map(s => [s.id, s.inc])),
    extras: {}, sheet: params.get('sheet'), ctx: params.get('ctx'), toast: params.get('toast'),
    wrap: params.get('wrap') || 'paper', unwrap: new Set((params.get('unwrap') || '').split(',').filter(Boolean)),
  };
  (params.get('added') || '').split(',').filter(Boolean).forEach(k => { const [item, g, q] = k.split(':'); S.extras[`${item}|${g}`] = Number(q || 1); });
  (params.get('swap') || '').split(',').filter(Boolean).forEach(k => { const [slot, item] = k.split(':'); S.pick[slot] = item; });
  (params.get('qty') || '').split(',').filter(Boolean).forEach(k => { const [slot, q] = k.split(':'); S.qty[slot] = Number(q); });
  return S;
}

const $ = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
function slotCost(id) {
  const s = SLOTS[id]; const it = I[S.pick[id]];
  return (S.pick[id] === s.def || it.swap ? 0 : it.price) + Math.max(0, S.qty[id] - s.inc) * it.price;
}
function extrasCost() { return Object.entries(S.extras).reduce((t, [k, q]) => t + I[k.split('|')[0]].price * q, 0); }
function extraTotal() { return Object.keys(SLOTS).reduce((t, id) => t + slotCost(id), 0) + extrasCost(); }
function total() { return BASE + extraTotal(); }
function extrasIn(gid) { return Object.entries(S.extras).filter(([k]) => k.split('|')[1] === gid).map(([k, q]) => ({ item: k.split('|')[0], q })); }

/* ---------- icons (inline, gold by default) ---------- */
/* Placeholder icons for the mockups only. The build keeps the site's own logomark, Rav icon and favorite heart. */
const LOGO = `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="7" cy="8" r="4.6" fill="#111827"/><circle cx="19" cy="8" r="4.6" fill="#111827"/><circle cx="13" cy="8" r="4.6" fill="#111827"/><circle cx="10" cy="15" r="4.6" fill="#111827"/><circle cx="16" cy="15" r="4.6" fill="#111827"/><circle cx="13" cy="21" r="4.2" fill="#111827"/></svg>`;
const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8AC7F" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;
const KID_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#111827"><circle cx="12" cy="4.5" r="2.5"/><path d="M6 8.5l4 1v4.5l-1.5 8h2.5l1-6 1 6h2.5l-1.5-8V9.5l4-1-.5-2-5 1.2h-2L6.5 6.5z"/></svg>`;
const USER_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#111827"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21c.8-4.5 4.3-7 8.5-7s7.7 2.5 8.5 7z"/></svg>`;
const CART_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#111827"><path d="M2 3h3l2.5 11h11l2-8H7" stroke="#111827" stroke-width="2" fill="none"/><circle cx="9" cy="19" r="1.8"/><circle cx="17" cy="19" r="1.8"/></svg>`;
const CAL_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B8AC7F" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const CHECK_ICON_BIG = (c) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>`;
const DONATE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="6" r="3"/><path d="M2 14h4l5 1.5a1.6 1.6 0 0 1-.6 3.1H8"/><path d="M6 13.5V21h8.5l6.7-4.4a1.7 1.7 0 0 0-2-2.8L14 16.5"/></svg>`;
const HEART_TILE = `<svg viewBox="4 5.5 16 16" fill="none"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
const HEART = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
function practiceIcon(id, c = '#B8AC7F') {
  const p = {
    candles: `<path d="M12 3c1 1.5 1 2.5 0 3.5-1-1-1-2 0-3.5z" fill="${c}"/><path d="M12 8v8M7 10v6M17 10v6M4.5 11v5M19.5 11v5M9.5 10v6M14.5 10v6" stroke="${c}" stroke-width="1.6"/><path d="M4 16h16M12 16v4M8 20.5h8" stroke="${c}" stroke-width="1.8"/>`,
    dreidel: `<path d="M12 2.5v4" stroke="${c}" stroke-width="2"/><path d="M6 7h12l-1 7-5 7.5L7 14z" fill="${c}"/>`,
    eat: `<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6" stroke="${c}" stroke-width="1.8" fill="none"/><path d="M16 21V3c2.5 1.5 3.5 4 3.5 8H16" stroke="${c}" stroke-width="1.8" fill="${c}"/>`,
    story: `<path d="M5 3.5h11.5a2 2 0 0 1 2 2V21H7a2 2 0 0 1-2-2z" fill="${c}"/><path d="M8 8h7M8 11h7" stroke="#fff" stroke-width="1.5"/>`,
    gifts: `<rect x="3.5" y="9" width="17" height="4" fill="${c}"/><rect x="5" y="13" width="14" height="8" fill="${c}"/><path d="M12 9v12" stroke="#fff" stroke-width="1.6"/><path d="M12 9c-2-4-6-4-5-1 .5 1.2 3 1 5 1zm0 0c2-4 6-4 5-1-.5 1.2-3 1-5 1z" stroke="${c}" stroke-width="1.6" fill="none"/>`,
  }[id];
  return `<svg class="picon" width="20" height="20" viewBox="0 0 24 24">${p}</svg>`;
}

/* Stemless hanukkiah, drawn flat. Night n puts candles in the rightmost n cups; the shamash always stands in the middle. */
function hanukkiah(night = 0, { lit = true, dark = false, width = 300, label = '' } = {}) {
  const sw = 20, cx = 160, cupY = 121, shY = 105, rs = [34, 68, 102, 136], foot = cupY + 136;
  const xs = [24, 58, 92, 126, 160, 194, 228, 262, 296];
  const order = [8, 7, 6, 5, 3, 2, 1, 0].slice(0, night);
  const metal = dark ? '#F3F0E6' : '#111827', wax = '#D1D5DB', flame = '#B8AC7F', r = sw / 2;
  const candle = (x, base, on) => {
    const bot = base - r - 6 - r, top = bot - 18, f = top - r - 9;
    return `<path d="M${x} ${bot}V${top}" stroke="${wax}" stroke-width="${sw}" stroke-linecap="round"/>${on ? `<path d="M${x} ${f - 30}C${x + 6} ${f - 22} ${x + r} ${f - 16} ${x + r} ${f - r}A${r} ${r} 0 0 1 ${x - r} ${f - r}C${x - r} ${f - 16} ${x - 6} ${f - 22} ${x} ${f - 30}Z" fill="${flame}"/>` : ''}`;
  };
  let svg = rs.map(rr => `<path d="M${cx - rr} ${cupY}A${rr} ${rr} 0 0 0 ${cx + rr} ${cupY}" fill="none" stroke="${metal}" stroke-width="${sw}" stroke-linecap="round"/>`).join('');
  svg += `<path d="M${cx} ${foot}V${shY}" stroke="${metal}" stroke-width="${sw}" stroke-linecap="round"/>`;
  svg += order.map(i => candle(xs[i], cupY, lit)).join('') + candle(cx, shY, lit || night > 0);
  return `<svg class="hk" viewBox="0 0 320 ${foot + r + 2}" width="${width}" role="img" aria-label="${label || `Night ${night}`}">${svg}</svg>`;
}

/* ---------- building blocks ---------- */
function thumb(id, size, tag, gold) {
  return `<div class="thumb" style="width:${size}px;height:${size}px"><img src="${I[id].img}" alt="">${tag ? `<div class="tag ${gold ? 'gold' : ''}">${tag}</div>` : ''}</div>`;
}
/* Stepper for an included line. At the included minimum the − becomes Donate, matching the live box. */
function stepper(slot, q, compact) {
  const s = SLOTS[slot];
  const atFloor = q <= 1;
  return `<div class="stepper ${compact ? 'compact' : ''}"><button aria-label="${atFloor ? 'Donate' : 'Fewer'}" class="${atFloor ? 'donate' : ''}" onclick="event.stopPropagation();setQty('${slot}',-1)">${atFloor ? DONATE : '−'}</button><span>${q}</span><button aria-label="More" onclick="event.stopPropagation();setQty('${slot}',1)">+</button></div>`;
}
function extraStepper(id, gid, q, onImage) {
  return `<div class="stepper ${onImage ? 'on-image' : ''}"><button onclick="event.stopPropagation();addExtra('${id}','${gid}',-1)">−</button><span>${q}</span><button onclick="event.stopPropagation();addExtra('${id}','${gid}',1)">+</button></div>`;
}
function lineRow(slot) {
  const s = SLOTS[slot]; const id = S.pick[slot]; const it = I[id]; const q = S.qty[slot];
  const extra = Math.max(0, q - s.inc); const donated = Math.max(0, s.inc - q);
  if (q === 0) return `<div class="row donated">${thumb(id, 64)}<div class="meta"><div class="name">${it.name}</div><div class="note">Donating · goes to a family who wouldn't otherwise celebrate</div></div><button class="link" onclick="setQty('${slot}',1)">Undo</button></div>`;
  const forKid = s.kid ? ` for ${KID}` : '';
  const sub = extra ? `<span class="goldtxt">Included${forKid} ×${s.inc}</span> · +${extra} for ${$(extra * it.price)}` : donated ? `<span class="goldtxt">Included${forKid}</span> · donating ${donated}` : `<span class="goldtxt">${id !== s.def ? 'Swapped in · included' : 'Included'}${forKid}${s.incNote ? ` · ${s.incNote}` : ''}</span>`;
  return `<div class="row tappable" onclick="openProduct('${id}','${s.group}')">${thumb(id, 64)}<div class="meta"><div class="name">${it.name}</div><div class="note">${sub}</div></div>${stepper(slot, q)}</div>`;
}
function extraRow(id, gid, q) {
  const g = GROUPS.find(x => x.id === gid);
  return `<div class="row"><div onclick="openProduct('${id}','${gid}')">${thumb(id, 64, g.gift ? `for ${KID}` : 'Added', !g.gift)}</div><div class="meta"><div class="name">${I[id].name}</div><div class="note">Added · ${$(I[id].price * q)}</div></div>${extraStepper(id, gid, q)}</div>`;
}
function wrapBlock() {
  const wrappable = [S.pick.gift, S.pick.book, ...extrasIn('gifts').map(e => e.item)];
  const opt = (v, t, s) => `<button class="seg ${S.wrap === v ? 'on' : ''}" onclick="S.wrap='${v}';render()"><b>${t}</b><span>${s}</span></button>`;
  return `<div class="wrap"><div class="wrap-head"><span>Wrapping</span></div><div class="segs">${opt('paper', 'Paper', 'Included')}${opt('prewrap', 'We wrap', 'Included')}${opt('none', 'No wrap', 'Donate it')}</div>
    ${S.wrap === 'none' ? '' : `<div class="muted small" style="margin:10px 0 4px">${S.wrap === 'prewrap' ? 'We\'ll wrap these before they ship:' : 'Enough paper for:'}</div>${wrappable.map(w => `<label class="check"><span class="box ${S.unwrap.has(w) ? '' : 'on'}" onclick="S.unwrap.has('${w}')?S.unwrap.delete('${w}'):S.unwrap.add('${w}');render()">${S.unwrap.has(w) ? '' : CHECK_ICON}</span>${thumb(w, 30)}<span>${I[w].name}</span></label>`).join('')}`}</div>`;
}
function alsoAdded(title, ids) {
  return `<div class="also"><div class="eyebrow">${title}</div><div class="shelf">${ids.map(id => {
    const gid = GROUPS.find(g => g.extras.includes(id))?.id || 'gifts';
    const q = S.extras[`${id}|${gid}`] || 0;
    return `<div class="card"><div class="thumb sq" onclick="openProduct('${id}','${gid}')"><img src="${I[id].img}" alt="">${I[id].badge ? `<div class="corner">${I[id].badge}</div>` : ''}</div><div class="cname">${I[id].name}</div><div class="cprice">${$(I[id].price)}</div>${q ? extraStepper(id, gid, q) : `<div class="actions"><button class="pill dark" onclick="addExtra('${id}','${gid}')">+ Add</button></div>`}</div>`;
  }).join('')}</div></div>`;
}
function stickyBar(label, fill, onClick) {
  const x = extraTotal();
  return `<div class="bar"><div class="bar-inner"><button class="sum" onclick="openSheet('receipt')"><span>Box ${$(BASE)}${x ? ` <span class="goldtxt">+ ${$(x)}</span>` : ''}</span><b>Total ${$(total())} <span class="chev">⌃</span></b></button><button class="cta ${fill ? 'fill' : ''}" onclick="${onClick || ''}">${label}</button></div></div>`;
}
function sheet(body, foot) {
  return `<div class="scrim" onclick="closeSheet()"></div><div class="sheet"><div class="grab"></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</div>`;
}
function receiptBody(editable) {
  let h = '';
  for (const g of GROUPS) {
    h += `<div class="rc-group"><div class="rc-head">${practiceIcon(g.id)}<span>${g.title}</span>${editable ? `<button class="link" onclick="S.step=${GROUPS.indexOf(g)};render();scrollTo(0,0)">Change</button>` : ''}</div>`;
    for (const s of g.slots) {
      if (s.id === 'wrap') { h += `<div class="rc-row">${thumb('wrapping', 34)}<span>${S.wrap === 'prewrap' ? 'We wrap the presents' : S.wrap === 'none' ? 'No wrapping (donated)' : 'Wrapping Paper'}</span><span class="r">Included</span></div>`; continue; }
      const id = S.pick[s.id]; const q = S.qty[s.id]; const c = slotCost(s.id); const don = Math.max(0, s.inc - q);
      if (q > 0) h += `<div class="rc-row">${thumb(id, 34)}<span>${I[id].name}${q > 1 ? ` ×${q}` : ''}</span><span class="r">${c ? '+' + $(c) : 'Included'}</span></div>`;
      if (don) h += `<div class="rc-row don"><span class="heart">${HEART}</span><span>Donating ${don} ${I[id].name}</span><span class="r">—</span></div>`;
    }
    for (const e of extrasIn(g.id)) h += `<div class="rc-row">${thumb(e.item, 34)}<span>${I[e.item].name}${e.q > 1 ? ` ×${e.q}` : ''}</span><span class="r">+${$(I[e.item].price * e.q)}</span></div>`;
    h += `</div>`;
  }
  h += `<div class="rc-total"><div><span>Box</span><span>${$(BASE)}</span></div><div><span>Extras</span><span>${$(extraTotal())}</span></div><div class="big"><span>Total</span><span>${$(total())}</span></div></div>`;
  return h;
}
function receiptSheet() {
  return sheet(`<div class="sheet-title"><div class="h2">Your box</div><button class="link" onclick="closeSheet()">Keep editing</button></div>${receiptBody(false)}`, `<button class="btn-block">Checkout · ${$(total())}</button>`);
}
/* Product sheet opened from a section. The section decides the default actions; a gift link covers the other role. */
function productSheet(id, gid) {
  const it = I[id]; const g = GROUPS.find(x => x.id === gid) || GROUPS[0];
  const slot = g.slots.find(s => s.alts.includes(id) || s.def === id);
  const inBox = slot && S.pick[slot.id] === id;
  const q = S.extras[`${id}|${gid}`] || 0;
  const giftable = !g.gift && GROUPS.find(x => x.gift).extras.includes(id);
  let actions = '';
  if (inBox) {
    const extra = Math.max(0, S.qty[slot.id] - slot.inc);
    actions += `<div class="ps-act ps-inbox-row"><span><b>${CHECK_ICON} In your box</b><br><span class="muted small">${extra ? `+${extra} extra · ${$(extra * it.price)}` : `Included${slot.kid ? ` for ${KID}` : ''}`}</span></span>${stepper(slot.id, S.qty[slot.id])}</div>`;
  } else if (slot) actions += `<button class="ps-act" onclick="swapTo('${slot.id}','${id}');closeSheet()"><span><b>Swap it in</b><br><span class="muted small">Instead of your ${I[S.pick[slot.id]].name}</span></span><span class="r">Included</span></button>`;
  if (!inBox) actions += q ? `<div class="ps-act ps-inbox-row"><span><b>${CHECK_ICON} Added</b><br><span class="muted small">On top of everything in your box</span></span>${extraStepper(id, gid, q)}</div>` : `<button class="ps-act" onclick="addExtra('${id}','${gid}')"><span><b>Add ${slot ? 'one on top' : 'to my box'}</b><br><span class="muted small">${slot ? 'Keeps everything already in your box' : g.gift ? `A present for ${KID}` : `For ${g.title}`}</span></span><span class="r">+ ${$(it.price)}</span></button>`;
  if (giftable && !inBox) actions += `<button class="link ps-gift" onclick="addExtra('${id}','gifts');closeSheet()">Or give it to ${KID} as a wrapped present · ${$(it.price)}</button>`;
  const back = S.prev && GROUPS.find(x => x.id === S.prev);
  const top = `<div class="ps-top">${back ? `<button class="ps-back" onclick="closeSheet()">‹ ${back.title}</button>` : '<span></span>'}<button class="ps-x" aria-label="Close" onclick="S.prev=null;closeSheet()">✕</button></div>`;
  return sheet(`${top}<div class="ps-img"><img src="${it.img}" alt=""><div class="ps-dots"><i class="on"></i><i></i><i></i></div></div><div class="ps-body"><div class="eyebrow">${g.title}</div><div class="h2" style="margin:4px 0 6px">${it.name}</div><div class="sub ps-desc">${it.desc || 'Picked for families like yours. Ships in your box, ready for all eight nights.'}</div>${actions}<a class="ps-more" href="#" onclick="return false">See full details<span>›</span></a></div>`);
}
/* Only reached from search or a product page outside the box, where no section implies a role. */
function roleSheet(id) {
  const it = I[id];
  const o = (on, t, s, p) => `<button class="role ${on ? 'on' : ''}"><div class="dot"></div><div style="flex:1"><div class="rt">${t}</div><div class="rs">${s}</div></div><div class="rp">${p}</div></button>`;
  return sheet(`<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">${thumb(id, 60)}<div><div class="eyebrow">Add to your box as…</div><div class="h2" style="font-size:17px;margin-top:4px">${it.name}</div></div></div>
    ${o(false, 'A swap for your wooden dreidels', 'Replaces them in Play Dreidel', 'Included')}${o(false, 'An extra dreidel', 'On top of everything in your box', '+ $3')}${o(true, `A present for ${KID}`, `Wrapped with ${KID}'s gifts`, '+ $3')}`, `<button class="btn-block">Add to my box</button>`);
}
function toastHtml() { return S.toast ? `<div class="toast">${CHECK_ICON}<span>${S.toast}</span><button class="link" onclick="S.toast=null;render()">Undo</button></div>` : ''; }

/* ---------- actions ---------- */
function setQty(slot, d) {
  const s = SLOTS[slot]; S.qty[slot] = Math.max(0, S.qty[slot] + d);
  const it = I[S.pick[slot]];
  S.toast = d > 0 && S.qty[slot] > s.inc ? `Added another ${it.name} · ${$(it.price)}` : d < 0 && S.qty[slot] < s.inc ? `Donating 1 ${it.name}` : null;
  render();
}
function swapTo(slot, item) { if (S.pick[slot] === item) return; S.pick[slot] = item; S.toast = `Swapped in ${I[item].name}`; render(); }
function addExtra(item, gid, d = 1) {
  const k = `${item}|${gid}`; S.extras[k] = Math.max(0, (S.extras[k] || 0) + d); if (!S.extras[k]) delete S.extras[k];
  S.toast = d > 0 ? `Added ${I[item].name}${gid === 'gifts' ? ` for ${KID}` : ''} · ${$(I[item].price)}` : null; render();
}
function openSheet(id) { S.sheet = id; S.toast = null; render(); }
function openProduct(id, gid) {
  S.prev = S.sheet && !S.sheet.startsWith('product:') && S.sheet !== 'receipt' ? S.sheet : null;
  S.sheet = 'product:' + id; S.ctx = gid; S.toast = null; render();
}
function closeSheet() {
  if (S.sheet && S.sheet.startsWith('product:') && S.prev) { S.sheet = S.prev; S.prev = null; }
  else S.sheet = null;
  render();
}

/* ---------- dates and box state shared by every page ---------- */
const LOCK_SHORT = 'Nov&nbsp;7';
const LOCK_LONG = 'Nov&nbsp;7';
const DAYS_LEFT = 28;
const NOT_HELD = "Items aren't held until you add a card. Popular ones can sell out.";

/* ---------- site header and menu, the same on every page ---------- */
function siteHeader() {
  return `<div class="site-header"><div class="sh-row"><div class="sh-left">${LOGO}<button class="burger-hit" aria-label="Open menu" onclick="S.menu='1';render()"><div class="burger"></div></button></div><div class="search">${SEARCH_ICON}<span>Search</span></div><div class="sh-icons"><div class="ic gold">${KID_ICON}</div><div class="ic">${USER_ICON}</div><div class="ic">${CART_ICON}</div></div></div></div>`;
}
const CATS = [['Menorahs', 'arch'], ['Candles', 'beeswax'], ['Dreidels', 'wooden'], ['Gelt', 'biggelt'], ['Food', 'latke'], ['Books', 'dragon'], ['Stuffies', 'shamash'], ['Toys', 'lego'], ['Activities', 'clay'], ['On sale', null]];
const BOX_THUMBS = ['beeswax', 'wooden', 'biggelt', 'latke', 'dragon', 'shamash'];
/* Full-screen panel, opened by tap only: no edge-swipe drawer, which fights Instagram's own swipe-back.
   box: 'none' (signed out, no box), 'draft' (box, no card), 'set' (order placed). */
function menuPanel(box = 'draft') {
  const shopOpen = S.menu === 'shop';
  const row = (label, { sub, chev = '›', on, open } = {}) => `<button class="mn-row" ${on ? `onclick="${on}"` : ''}><span><span class="mn-l">${label}</span>${sub ? `<span class="mn-s">${sub}</span>` : ''}</span><span class="mn-c ${open ? 'open' : ''}">${chev}</span></button>`;
    const ig = document.documentElement.classList.contains('ig');
  const boxCard = box === 'none'
    ? boxSummary({ size: 'sm', tag: 'button', title: 'Build my box', sub: 'Everything for eight nights, from $80', link: '<span class="mn-c">›</span>', attrs: 'style="margin-bottom:8px"' })
    : boxSummary({ size: 'sm', tag: 'button', title: 'My Box', sub: `${box === 'set' ? `Set · ships after ${LOCK_SHORT}` : `Change anything until ${LOCK_SHORT}`} · ${$(total())}`, link: '<span class="mn-c">›</span>', attrs: 'style="margin-bottom:8px" onclick="S.menu=null;render()"', body: box === 'draft' ? `<span class="bs-held">${NOT_HELD}</span>` : '' });
  return `<div class="mn"><div class="mn-head">${LOGO}<span class="mn-title">Menu</span><button class="mn-x" aria-label="Close menu" onclick="S.menu=null;render()">✕</button></div>
  <div class="mn-body">
    ${boxCard}
    ${row('Shop', { chev: '⌄', open: shopOpen, on: `S.menu=S.menu==='shop'?'1':'shop';render()` })}
    ${shopOpen ? `<div class="mn-cats">${CATS.map(([l, img]) => `<button class="mn-cat">${img ? thumb(img, 40) : `<span class="mn-sale">%</span>`}<span>${l}</span></button>`).join('')}</div><button class="mn-all">Shop everything ›</button>` : ''}
    ${row('Send a gift', { sub: 'A box for another family' })}
    <div class="mn-h">Learn</div>
    ${row('How to light the candles')}
    ${row('How to play dreidel')}
    ${row('Our story')}
    <div class="mn-h">You</div>
    ${box === 'none' ? row('Sign in', { sub: 'We email you a code. No password needed.' }) : row('Account', { sub: 'Orders, family, payment' })}
    <button class="mn-row"><span class="mn-rav"><span class="ic gold">${KID_ICON}</span><span><span class="mn-l">Ask Rav</span><span class="mn-s">Questions about your box or Hanukkah</span></span></span><span class="mn-c">›</span></button>
    ${row('Email us', { sub: 'hello@grapejuice.co' })}
    ${ig && box !== 'none' ? `<div class="mn-ig"><b>Don't lose your box</b><span>Instagram's browser can sign you out. We'll email you a link to open your box in Safari or Chrome.</span><button class="pill dark">Email me a link</button></div>` : ''}
  </div></div>`;
}

/* ---------- page building blocks for the store, home, gift and account mockups ---------- */
const HEART_FILLED = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#111827" stroke="#111827" stroke-width="2"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
/* The one header for every flow: back on the left, mark and title in the middle, a step count or "Secure" on the right. */
function taskHeader({ back = '', title = '', right = '', steps = null, on = 0, mark = LOGO } = {}) {
  const bars = steps ? `<div class="th-steps" style="grid-template-columns:repeat(${steps.length},1fr)">${steps.map((t, i) => `<div class="${i < on ? 'done' : i === on ? 'on' : ''}"><i></i><span>${t}</span></div>`).join('')}</div>` : '';
  return `<div class="th"><div class="th-row"><button class="th-back">${back ? `‹ ${back}` : ''}</button><div class="th-mid">${mark}${title ? `<span>${title}</span>` : ''}</div><span class="th-r">${right}</span></div>${bars}</div>`;
}
function pageHeader(title, back) { return taskHeader({ title, back }); }
/* state: '' | 'inbox' | 'added' | 'sold' | 'low' | 'fav' */
function productTile(id, state = '', opts = {}) {
  const it = I[id];
  const corner = state === 'sold' ? `<div class="corner">Sold out</div>` : (state === 'low' || (it.badge && !state)) ? `<div class="corner">${it.badge || 'Low stock'}</div>` : '';
  const ck = state === 'inbox' || state === 'added' ? `<span class="ck">${CHECK_ICON}</span>` : '';
  const status = state === 'inbox' ? `<span class="goldtxt">In your box · included</span>` : state === 'added' ? `<span class="goldtxt">Added · ${$(it.price)}</span>` : state === 'sold' ? 'Sold out' : opts.sub || $(it.price);
  const btn = opts.noBtn || state === 'sold' || state === 'inbox' || state === 'added' ? '' : `<button class="pt-btn">${opts.btn || 'Add to my box'}</button>`;
  return `<div class="pt ${state === 'inbox' || state === 'added' ? 'inbox-look' : ''} ${state === 'sold' ? 'sold' : ''}"><div class="thumb sq"><img src="${it.img}" alt="">${ck || corner}<span class="pt-heart ${state === 'fav' ? 'on' : ''}">${HEART_TILE}</span></div><div class="cname">${it.name}</div><div class="cprice">${status}</div>${btn}</div>`;
}
/* The box summary, one look everywhere: large on pages, small in the menu, the box editor and checkout. */
function boxThumbRow(items = BOX_THUMBS) {
  return `<div class="bs-thumbs ${items.length > 6 ? 'scroll' : ''}">${items.map(x => { const it = typeof x === 'string' ? { id: x } : x; return `<div class="bs-t ${it.mine ? 'mine' : ''} ${it.blur ? 'blur' : ''}" ${it.on ? `onclick="${it.on}"` : ''}><img src="${I[it.id].img}" alt="">${it.count ? `<span class="bs-n">${it.count}</span>` : ''}${it.label ? `<span class="bs-more">${it.label}</span>` : ''}</div>`; }).join('')}</div>`;
}
function boxSummary({ size = 'lg', title = 'Your Hanukkah box', total = '', sub = '', link = '', items = BOX_THUMBS, body = '', tag = 'div', attrs = '' } = {}) {
  return `<${tag} class="bs ${size}" ${attrs}><div class="bs-top"><span class="bs-title"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span>${total ? `<span class="bs-total">${total}</span>` : ''}${link}</div>${boxThumbRow(items)}${body}</${tag}>`;
}
/* Order summary for every payment step: the small box summary, then the price lines. Values can be "Covered". */
function orderSummary({ title = 'Your Hanukkah box', sub = '', items = BOX_THUMBS, lines = [], totalLabel = 'Total', total = '', extra = '' } = {}) {
  const row = ([l, v]) => `<div><span>${l}</span><span class="${v === 'Covered' ? 'cov' : ''}">${v}</span></div>`;
  return boxSummary({ size: 'sm', title, sub, items, body: `${extra}<div class="os-lines">${lines.map(row).join('')}<div class="tot"><span>${totalLabel}</span><span>${total}</span></div></div>` });
}
/* "Get it in the box" card for visitors without a box: the box contents with these items in it, and the math. */
function boxPitch(ids, { cta = 'Start a box with it', title } = {}) {
  const included = (id) => Object.values(SLOTS).some(s => s.def === id || s.alts.includes(id));
  const add = ids.filter(id => !included(id)).reduce((t, id) => t + I[id].price, 0);
  const rest = BOX_THUMBS.filter(id => !ids.includes(id)).slice(0, 6 - ids.length);
  const label = ids.length === 1 ? I[ids[0]].name : `These ${ids.length} items`;
  const body = `<div class="bp-lines"><div><span>Hanukkah box<small>Candles, dreidels, gelt, food kits, a book and a present for each kid</small></span><b>${$(BASE)}</b></div>
      <div><span>${label}</span><b>${add ? `+${$(add)}` : 'Included'}</b></div><div class="tot"><span>Total</span><b>${$(BASE + add)}</b></div></div>
    <button class="place">${cta}</button><div class="bp-note">Free shipping · change anything until ${LOCK_SHORT} · charged when it ships</div>`;
  return `<div class="bp-wrap" id="g-pitch">${boxSummary({ title: title || 'Everything for eight nights, with this in it', sub: 'Get it in the Hanukkah box', items: [...ids.map(id => ({ id, mine: true })), ...rest], body })}</div>`;
}
function field(label, value, { ph, focus, done, hint, extra = '' } = {}) {
  return `<div class="f"><label>${label}</label><div class="in ${ph ? 'ph' : ''} ${focus ? 'focus' : ''} ${done ? 'done' : ''}">${value}</div>${hint ? `<div class="f-hint">${hint}</div>` : ''}${extra}</div>`;
}
function sectionHead(title, link) {
  return `<div class="sec-row"><div class="h2">${title}</div>${link ? `<button class="link">${link}</button>` : ''}</div>`;
}
function siteFooter() {
  const col = (h, items) => `<div class="ft-col"><div class="ft-h">${h}</div>${items.map(i => `<span>${i}</span>`).join('')}</div>`;
  return `<footer class="ft"><div class="ft-top">${LOGO}<span>Hanukkah, made easy.</span></div><div class="ft-cols">${col('Shop', ['Shop all', 'Menorahs', 'Candles', 'Stuffies', 'Books'])}${col('Company', ['Our story', 'Send a gift', 'Account', 'Terms', 'Privacy'])}${col('Contact', ['Ask Rav', 'hello@grapejuice.co', 'Instagram'])}</div></footer>`;
}
/* Which ways an item can join the box, from what the box already has. */
function roleOptions(id) {
  const opts = [];
  const slot = Object.values(SLOTS).find(s => s.alts.includes(id) || s.def === id);
  if (slot && S.pick[slot.id] !== id) opts.push({ k: 'swap', t: `Swap it in for your ${I[S.pick[slot.id]].short || I[S.pick[slot.id]].name}`, s: `Replaces it in ${GROUPS.find(g => g.id === slot.group).title}`, p: 'Included' });
  opts.push({ k: 'extra', t: slot ? 'Add one on top' : 'Add to my box', s: 'Keeps everything already in your box', p: `+${$(I[id].price)}` });
  if (GROUPS.find(g => g.gift).extras.includes(id) || slot?.kid) opts.push({ k: 'gift', t: `A present for ${KID}`, s: `Wrapped with ${KID}'s gifts`, p: `+${$(I[id].price)}` });
  return opts;
}
function roleChooser(id, on = 0) {
  const it = I[id];
  const o = roleOptions(id).map((x, i) => `<button class="role ${i === on ? 'on' : ''}"><div class="dot"></div><div style="flex:1"><div class="rt">${x.t}</div><div class="rs">${x.s}</div></div><div class="rp">${x.p}</div></button>`).join('');
  return sheet(`<div style="display:flex;gap:12px;align-items:center;margin:4px 0 16px">${thumb(id, 60)}<div><div class="eyebrow">Add to your box as…</div><div class="h2" style="font-size:17px;margin-top:4px">${it.name}</div></div></div>${o}`, `<button class="btn-block">Add to my box</button>`);
}

/* ---------- checkout pieces reused by store, gift and account ---------- */
const LOCK_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const CARD_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7D7148" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/></svg>`;
const EDIT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7D7148" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`;
const CLOCK_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7D7148" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const APPLE = `<svg width="18" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.64.8-3.33.8-.69 0-1.74-.78-2.86-.76-1.47.02-2.83.86-3.59 2.17-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.24 2.73 2.2 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.07 2.65-2.13.84-1.22 1.18-2.41 1.2-2.47-.03-.01-2.28-.87-2.3-3.47zM14.2 6.13c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.08 1.96-.49 2.56-1.21z"/></svg>`;
const BIG_CHECK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
function coHead(back = 'Box', title = 'Checkout', secure = true) { return taskHeader({ back, title, right: secure ? `${LOCK_ICON} Secure` : '' }); }
function stripeForm(wallet) {
  return `${wallet ? `<div class="express"><button class="xbtn">${APPLE}Pay</button></div><div class="or">or pay with card</div>` : ''}<div class="stripe"><div class="lab">Card number</div><div class="in cardnum ph">1234 1234 1234 1234<span class="brands"><i></i><i></i><i></i></span></div><div class="two"><div><div class="lab">Expiration</div><div class="in ph">MM / YY</div></div><div><div class="lab">Security code</div><div class="in ph">CVC</div></div></div><div class="link-note"><b>link</b><span>Save your card with Link for one-tap checkout next time</span></div></div>`;
}
function addressFields() {
  return `${field('Full name', 'Rachel Levin', { done: true })}${field('Address', '120 Bedford Ave', { done: true })}<button class="addlink">+ Apt, suite or floor</button><div class="row3">${field('City', 'Brooklyn', { done: true })}${field('State', 'NY', { done: true })}${field('ZIP', '11249', { done: true })}</div>`;
}
/* Email-code sign-in, used wherever we'd otherwise ask for a password. */
function codeEntry(sent, cta = 'Send my code') {
  return sent
    ? `<div class="sentto">Sent to <b>ra•••@gmail.com</b> · <u style="color:#7D7148">Change</u></div><div class="code"><span>4</span><span>1</span><span class="cur"></span><span></span><span></span><span></span></div><div class="alt">Didn't get it? <u>Send again</u></div>`
    : `<div class="f" style="margin-top:22px"><label>Email</label><div class="in ph">you@example.com</div></div><button class="place" style="margin-top:8px">${cta}</button>`;
}
function timeline(items) {
  return `<div class="tl">${items.map(([t, s], i) => `<div><i class="${i === 0 ? 'on' : ''}"></i><p><b>${t}</b><span>${s}</span></p></div>`).join('')}</div>`;
}

/* ---------- Instagram in-app browser chrome (preview only) ---------- */
function applyIgChrome(params) {
  if (params.get('shot')) document.documentElement.classList.add('shot');
  if (params.get('ig') === '0') return;
  document.documentElement.classList.add('ig');
  const el = document.createElement('div');
  el.className = 'ig-chrome';
  el.innerHTML = `<div class="ig-status"><b>9:41</b><span class="ig-sys"><i></i><i></i><i></i><em></em></span></div><div class="ig-bar"><span class="ig-x">✕</span><span class="ig-title"><b>grapejuice.co</b><small>Grapejuice | ${window.PAGE_TITLE || 'My Box'}</small></span><span class="ig-more">•••</span></div>`;
  document.body.prepend(el);
  const home = document.createElement('div'); home.className = 'ig-home'; document.body.append(home);
}
function afterRender(params) {
  if (params.get('shot') && params.get('at')) {
    const anchor = document.getElementById('g-' + params.get('at'));
    if (anchor) {
      for (const el of [...anchor.parentElement.children]) {
        if (el === anchor) break;
        if (!el.matches('.chips, .c-tabs, .bar, .toast, .scrim, .sheet')) el.style.display = 'none';
      }
    }
    if (params.get('shelf')) { const [i, x] = params.get('shelf').split(':').map(Number); const sh = document.querySelectorAll('.shelf')[i]; if (sh) sh.scrollLeft = x; }
    return;
  }
  if (!window.__scrolled && (params.get('at') || params.get('scroll'))) {
    window.__scrolled = true;
    setTimeout(() => {
      const at = params.get('at'); const el = at && document.getElementById('g-' + at);
      const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 0;
      window.scrollTo(0, el ? el.getBoundingClientRect().top + scrollY - top - Number(params.get('offset') || 52) : Number(params.get('scroll')));
    }, 60);
  }
  if (!window.__spy) {
    window.__spy = true;
    addEventListener('scroll', () => {
      if (window.__jumping) return;
      const top = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top')) || 0) + 70;
      let cur = null;
      for (const g of GROUPS) { const el = document.getElementById('g-' + g.id); if (el && el.getBoundingClientRect().top < top) cur = g.id; }
      if (!cur || cur === window.__spyCur) return;
      window.__spyCur = cur;
      document.querySelectorAll('[data-chip]').forEach(c => { c.classList.toggle('on', c.dataset.chip === cur); if (c.dataset.chip === cur) c.parentElement.scrollLeft = c.offsetLeft - 16; });
    }, { passive: true });
  }
}
