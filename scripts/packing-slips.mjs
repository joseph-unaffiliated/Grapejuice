/**
 * 4×6 packing slips for every paid order on the packing list, sized for the PM-241-BT.
 *
 *   NODE_PATH=/tmp/slippdf/node_modules node scripts/packing-slips.mjs
 *   NODE_PATH=/tmp/slippdf/node_modules node scripts/packing-slips.mjs --print-first
 *   NODE_PATH=/tmp/slippdf/node_modules node scripts/packing-slips.mjs --print
 *
 * Writes ~/Downloads/Grapejuice packing slips.pdf. Prints only with --print-first or --print.
 * Includes Hanukkah boxes, gifts, shop orders, and complimentary boxes.
 * Test accounts are left out. Delayed items (toddler menorah, brass dreidel, slipcast dreidel)
 * are not packed here. The slip says they ship separately.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { firestoreFromFirebaseCliLogin } from "./lib/firebaseCliCredential.mjs";
import { isDelayedItemId } from "./lib/delayedItems.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit");
const { buildAdminPackingList } = require(join(here, "../functions/lib/adminPacking.js"));

const FONT_REGULAR = join(here, "packing-slip-fonts/DMSans-Regular.ttf");
const FONT_BOLD = join(here, "packing-slip-fonts/DMSans-Bold.ttf");
const LOGO = join(here, "../public/brand/grapejuice-wordmark.png"); // 712 × 224, transparent
const REG = "DMSans";
const BOLD = "DMSans-Bold";

// Page and grid
const PAGE_W = 288;
const PAGE_H = 432;
const M = 14;
const INNER = PAGE_W - M * 2;
const BOX = 8;
const QTY_GAP = 1;
const QTY_W = 16;
const TEXT_X = M + BOX + QTY_GAP + QTY_W + 4;
const TEXT_W = PAGE_W - M - TEXT_X;
const BORDER = 6;
const FOOTER_SIZE = 7.5;
const FOOTER_GAP = 6;
const PRINTER = "_PM_241_BT";

// Type. Tracking is in em: negative = tighter.
const TRACK = -0.03;
const LOGO_W = 68;
const LOGO_H = (LOGO_W * 224) / 712;
const SUB_SIZE = 9;
const NAME_SIZE = 12;
const ADDR_SIZE = 9;
const KIDS_SIZE = 8;
const TITLE_SIZE = 7.5;
const ROW_SIZE = 8;
const META_SIZE = 7;
const NOTE_SIZE = 8;

// Spacing (pt). Rows get ROW_GAP; a new section gets SECTION_GAP on top of that.
const HEADER_TOP = 14;
const AFTER_LOGO = 2;
const AFTER_RULE = 10;
const SECTION_GAP = 10;
const TITLE_H = 9;
const LABEL_GAP = 4;
const ROW_MIN = 10;
const ROW_GAP = 4;
const META_GAP = 1;

function newDoc() {
  const doc = new PDFDocument({
    autoFirstPage: false,
    size: [PAGE_W, PAGE_H],
    margin: 0,
    info: { Title: "Grapejuice packing slips", Author: "Grapejuice" },
  });
  doc.registerFont(REG, FONT_REGULAR);
  doc.registerFont(BOLD, FONT_BOLD);
  return doc;
}

function font(doc, bold, size) {
  doc.font(bold ? BOLD : REG).fontSize(size);
}

/** Text options with tracking for a given size. Used for drawing and measuring alike. */
function opts(size, extra = {}) {
  return { characterSpacing: TRACK * size, lineGap: 0, ...extra };
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00d7/g, "x")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddress(value) {
  return clean(value).replace(/,?\s*United States$/i, "").replace(/,\s*$/, "").trim();
}

function addressLines(address) {
  if (!address?.line1) return [];
  const lines = [cleanAddress(address.line1)];
  if (address.line2) lines.push(cleanAddress(address.line2));
  const city = clean(address.city);
  const state = clean(address.stateProvince);
  const zip = clean(address.postalCode);
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const blob = lines.join(" ").toLowerCase();
  const already = city && zip && blob.includes(city.toLowerCase()) && blob.includes(zip.toLowerCase());
  if (cityLine && !already) lines.push(cityLine);
  if (address.country && address.country !== "US") lines.push(clean(address.country));
  return lines.filter(Boolean);
}

/** Line under the logo for non-box orders. Box orders get nothing. */
function subline(pkg) {
  if (pkg.kind === "box") return null;
  if (pkg.kind === "gift") return clean(pkg.reference);
  if (pkg.kind === "shop") return "Shop order";
  return null;
}

function kidsLine(pkg) {
  if (!pkg.kids?.length) return "";
  return pkg.kids
    .map((kid) => {
      const name = clean(kid.name) || "Child";
      const age = kid.age != null && String(kid.age) !== "" ? clean(String(kid.age)) : "";
      return age ? `${name}, ${age}` : name;
    })
    .join("   ");
}

function groups(pkg, lines) {
  const household = [];
  const byChild = new Map();
  for (const line of lines) {
    if (!line.child) household.push(line);
    else {
      const key = clean(line.child) || "Child";
      const list = byChild.get(key) ?? [];
      list.push(line);
      byChild.set(key, list);
    }
  }
  const out = [];
  if (household.length) out.push({ title: byChild.size ? "Household" : "", lines: household });
  const kidOrder = (pkg.kids ?? []).map((kid) => clean(kid.name));
  const names = [...byChild.keys()].sort((a, b) => {
    const ia = kidOrder.indexOf(a);
    const ib = kidOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  for (const name of names) {
    const age = (pkg.kids ?? []).find((kid) => clean(kid.name) === name)?.age;
    const title = age != null && String(age) !== "" ? `${name}, ${clean(String(age))}` : name;
    out.push({ title, lines: byChild.get(name) });
  }
  return out;
}

/**
 * A delayed line leaves the box only when a ShipStation order will split it: Hanukkah boxes,
 * and gifts that already have a ShipStation order. Comps, shop orders, and unlabeled gifts pack as usual.
 */
function isSplitLine(pkg, line) {
  if (!isDelayedItemId(line.itemId)) return false;
  if (pkg.kind === "box") return true;
  if (pkg.kind === "gift" && pkg.labeled) return true;
  return false;
}

function blocksFor(pkg) {
  const blocks = [];
  const delayed = pkg.lines.filter((line) => isSplitLine(pkg, line));
  const packable = pkg.lines.filter((line) => !isSplitLine(pkg, line));
  if (delayed.length) {
    const names = [...new Set(delayed.map((line) => clean(line.name)))].join(", ");
    const text = packable.length
      ? `Ships separately: ${names}`
      : `On hold until delayed items arrive: ${names}`;
    blocks.push({ kind: "note", text });
  }
  for (const group of groups(pkg, packable)) {
    if (group.title) blocks.push({ kind: "title", text: group.title });
    for (const line of group.lines) blocks.push({ kind: "item", line });
  }
  return blocks;
}

function lineMeta(line) {
  return line.wrap ? "WRAPPED" : "";
}

/** Footer rule and caption, with the same gap above the caption as below it. */
function footerBox(doc) {
  font(doc, false, FOOTER_SIZE);
  const h = doc.heightOfString("0", opts(FOOTER_SIZE, { width: INNER }));
  const textY = PAGE_H - BORDER - FOOTER_GAP - h;
  const ruleY = textY - FOOTER_GAP;
  return { textY, ruleY, limitY: ruleY - 6 };
}

/** One line of header text. Returns the y after it. */
function putText(doc, str, y, { bold = false, size = 9, gap = 0 }, draw) {
  font(doc, bold, size);
  const o = opts(size, { width: INNER });
  const h = doc.heightOfString(str, o);
  if (draw) doc.text(str, M, y, o);
  return y + h + gap;
}

/**
 * Header for one slip. With draw=false it only measures and returns the y where items start,
 * so pagination and drawing use the same arithmetic.
 */
function layoutHeader(doc, pkg, continued, draw) {
  let y = HEADER_TOP;
  if (draw) doc.image(LOGO, M, y, { width: LOGO_W });
  y += LOGO_H + AFTER_LOGO;
  const sub = subline(pkg);
  if (sub) y = putText(doc, sub, y, { bold: true, size: SUB_SIZE, gap: 4 }, draw);
  if (draw) rule(doc, y, 1);
  y += AFTER_RULE;
  const who = clean(pkg.destination?.name || pkg.recipient || "");
  if (who) y = putText(doc, who, y, { bold: true, size: NAME_SIZE, gap: 3 }, draw);
  for (const line of addressLines(pkg.destination)) {
    y = putText(doc, line, y, { size: ADDR_SIZE }, draw);
  }
  const kids = kidsLine(pkg);
  if (kids) {
    y += 4;
    y = putText(doc, kids, y, { size: KIDS_SIZE }, draw);
  }
  if (continued) {
    y += 3;
    y = putText(doc, "continued", y, { size: KIDS_SIZE }, draw);
  }
  y += AFTER_RULE;
  if (draw) rule(doc, y, 0.6);
  return y + AFTER_RULE;
}

/**
 * One item row or group title. `block.before` is extra space above a title (0 at the top of a
 * slip or page). Returns the y after the block.
 */
function layoutBlock(doc, block, y, draw) {
  if (block.kind === "note") {
    y += block.before ?? 0;
    font(doc, true, NOTE_SIZE);
    const o = opts(NOTE_SIZE, { width: INNER });
    const h = doc.heightOfString(block.text, o);
    if (draw) doc.text(block.text, M, y, o);
    return y + h + SECTION_GAP;
  }
  if (block.kind === "title") {
    y += block.before ?? 0;
    if (draw) {
      font(doc, true, TITLE_SIZE);
      doc.text(block.text.toUpperCase(), M, y, opts(TITLE_SIZE, { width: INNER }));
    }
    return y + TITLE_H + LABEL_GAP;
  }

  const line = block.line;
  const name = clean(line.name);
  const meta = lineMeta(line);

  if (draw) {
    doc.lineWidth(0.9).rect(M, y + 1, BOX, BOX).stroke();
    font(doc, true, ROW_SIZE);
    doc.text(String(line.qty), M + BOX + QTY_GAP, y, {
      ...opts(ROW_SIZE),
      width: QTY_W,
      align: "right",
      lineBreak: false,
    });
  }

  // Meta sits right-aligned on the same line when the name leaves room for it.
  let metaW = 0;
  if (meta) {
    font(doc, true, META_SIZE);
    metaW = doc.widthOfString(meta, opts(META_SIZE)) + 8;
  }
  font(doc, false, ROW_SIZE);
  const nameW = doc.widthOfString(name, opts(ROW_SIZE));
  if (meta && nameW <= TEXT_W - metaW) {
    if (draw) {
      font(doc, false, ROW_SIZE);
      doc.text(name, TEXT_X, y, opts(ROW_SIZE, { width: TEXT_W - metaW, lineBreak: false }));
      font(doc, true, META_SIZE);
      doc.text(meta, TEXT_X, y + 0.5, opts(META_SIZE, { width: TEXT_W, align: "right", lineBreak: false }));
    }
    return y + ROW_MIN + ROW_GAP;
  }

  font(doc, false, ROW_SIZE);
  const nameH = Math.max(doc.heightOfString(name, opts(ROW_SIZE, { width: TEXT_W })), ROW_MIN);
  if (draw) doc.text(name, TEXT_X, y, opts(ROW_SIZE, { width: TEXT_W }));
  let h = nameH;
  if (meta) {
    font(doc, true, META_SIZE);
    const mh = doc.heightOfString(meta, opts(META_SIZE, { width: TEXT_W }));
    if (draw) doc.text(meta, TEXT_X, y + h + META_GAP, opts(META_SIZE, { width: TEXT_W }));
    h += META_GAP + mh;
  }
  return y + h + ROW_GAP;
}

function paginate(doc, pkg) {
  const blocks = blocksFor(pkg);
  const pages = [];
  let page = [];
  let y = layoutHeader(doc, pkg, false, false);
  let currentTitle = null;
  const limitY = footerBox(doc).limitY;
  const measure = (entry, yy) => layoutBlock(doc, entry, yy, false);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const next = blocks[i + 1];
    if (block.kind === "title") currentTitle = block;

    let entry = { ...block, before: block.kind === "title" && page.length ? SECTION_GAP : 0 };
    let endY = measure(entry, y);
    // Keep a group title with its first item.
    if (block.kind === "title" && next) endY = measure({ ...next, before: 0 }, endY);

    if (page.length && endY > limitY) {
      pages.push(page);
      page = [];
      y = layoutHeader(doc, pkg, true, false);
      if (block.kind === "item" && currentTitle) {
        const repeat = { ...currentTitle, before: 0 };
        page.push(repeat);
        y = measure(repeat, y);
      }
      entry = { ...block, before: 0 };
    }
    page.push(entry);
    y = measure(entry, y);
  }
  if (page.length || pages.length === 0) pages.push(page);
  return pages;
}

function rule(doc, y, weight) {
  doc.lineWidth(weight).moveTo(M, y).lineTo(PAGE_W - M, y).stroke();
}

function drawFooter(doc, pkg, pageIndex, pageCount) {
  const { textY, ruleY } = footerBox(doc);
  rule(doc, ruleY, 0.4);
  const packed = pkg.lines.filter((line) => !isSplitLine(pkg, line));
  const units = packed.reduce((sum, line) => sum + line.qty, 0);
  font(doc, false, FOOTER_SIZE);
  doc.fillColor("black");
  doc.text(`${packed.length} lines · ${units} units`, M, textY, opts(FOOTER_SIZE, {
    width: INNER * 0.72,
    lineBreak: false,
  }));
  if (pageCount > 1) {
    doc.text(`${pageIndex + 1} / ${pageCount}`, M, textY, opts(FOOTER_SIZE, {
      width: INNER,
      align: "right",
      lineBreak: false,
    }));
  }
}

function drawSlip(doc, pkg) {
  const pages = paginate(doc, pkg);
  pages.forEach((entries, pageIndex) => {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    doc.fillColor("black").strokeColor("black");
    doc.lineWidth(0.4).rect(6, 6, PAGE_W - 12, PAGE_H - 12).stroke();
    let y = layoutHeader(doc, pkg, pageIndex > 0, true);
    for (const entry of entries) y = layoutBlock(doc, entry, y, true);
    drawFooter(doc, pkg, pageIndex, pages.length);
  });
  return pages.length;
}

function sortKey(pkg) {
  const name = clean(pkg.destination?.name || pkg.recipient || pkg.reference);
  const parts = name.split(" ").filter(Boolean);
  const last = (parts.at(-1) ?? "").toLowerCase();
  const rest = parts.slice(0, -1).join(" ").toLowerCase();
  return `${last}\t${rest}\t${pkg.id}`;
}

/** Gift invites whose received-gift order is already in ShipStation. */
async function labeledGiftInviteIds(db) {
  const [indexSnap, orderSnap] = await Promise.all([
    db.collection("shipStationOrders").select().get(),
    db.collectionGroup("orders").select("orderType", "giftInviteId").get(),
  ]);
  const exported = new Set(indexSnap.docs.map((doc) => doc.id));
  const invites = new Set();
  for (const doc of orderSnap.docs) {
    if (!exported.has(doc.id)) continue;
    if (doc.get("orderType") !== "received_gift") continue;
    const inviteId = doc.get("giftInviteId");
    if (inviteId) invites.add(inviteId);
  }
  return invites;
}

export async function loadPackages() {
  const db = firestoreFromFirebaseCliLogin("grapejuice-pilot");
  if (!db) throw new Error("Firebase CLI login is not available on this machine.");
  const [list, labeledGifts] = await Promise.all([
    buildAdminPackingList(db),
    labeledGiftInviteIds(db),
  ]);
  const units = (pkg) => pkg.lines.reduce((sum, line) => sum + line.qty, 0);
  return list.packages
    .filter((pkg) => !pkg.test && !pkg.awaitingPayment)
    .map((pkg) =>
      pkg.kind === "gift" && labeledGifts.has(pkg.id.slice("gift_".length))
        ? { ...pkg, labeled: true }
        : pkg,
    )
    .sort(
      (a, b) =>
        units(b) - units(a) ||
        b.lines.length - a.lines.length ||
        sortKey(a).localeCompare(sortKey(b)),
    );
}

function writePdf(packages, outPath) {
  const doc = newDoc();
  const done = new Promise((resolve, reject) => {
    const stream = createWriteStream(outPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);
  });
  let labels = 0;
  for (const pkg of packages) labels += drawSlip(doc, pkg);
  doc.end();
  return done.then(() => labels);
}

function printPdf(outPath, pageRange) {
  const args = ["-d", PRINTER, "-o", "media=w288h432", "-o", "print-scaling=none", "-o", "fit-to-page=false"];
  if (pageRange) args.push("-o", `page-ranges=${pageRange}`);
  args.push(outPath);
  const result = spawnSync("lp", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "lp failed");
  return (result.stdout || "").trim();
}

const outPath = join(homedir(), "Downloads", "Grapejuice packing slips.pdf");
const packages = await loadPackages();
const labels = await writePdf(packages, outPath);

const measureDoc = newDoc();
let cursor = 1;
const multi = [];
const byKind = {};
for (const pkg of packages) {
  byKind[pkg.kind] = (byKind[pkg.kind] ?? 0) + 1;
  const pages = paginate(measureDoc, pkg).length;
  if (pages > 1) multi.push({ name: pkg.recipient, pdfPage: cursor, pages });
  cursor += pages;
}

console.log(JSON.stringify({ orders: packages.length, byKind, labels, multiPage: multi, outPath }, null, 2));

const arg = process.argv[2];
if (arg === "--print-first") {
  console.log(printPdf(outPath, "1"));
} else if (arg === "--print") {
  console.log(printPdf(outPath));
}
