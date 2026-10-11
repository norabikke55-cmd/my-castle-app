#!/usr/bin/env node
/**
 * OpenStreetMap（Overpass API）から日本の城跡データを取得して、
 *  - osm-out/castles.json  … アプリに同梱できる静的データ
 *  - osm-out/report.md     … 都道府県別の件数・100名城の網羅状況
 * を出力します。
 *
 * 使い方（Node.js 18 以上）:
 *   node fetch-osm-castles.mjs                      # 全47都道府県（約3分〜）
 *   node fetch-osm-castles.mjs --pref 12            # 試しに1県だけ（JISコード）
 *   node fetch-osm-castles.mjs --app ./src/App.tsx  # 100名城リストを読むApp.tsxのパス
 *   node fetch-osm-castles.mjs --refresh            # キャッシュを無視して再取得
 *
 * 取得した生データは osm-out/raw/ にキャッシュされるので、
 * 途中で失敗しても再実行すれば続きから進みます。
 *
 * データ © OpenStreetMap contributors（ODbL）。アプリ内に出典表記が必要です。
 */
import fs from "node:fs";
import path from "node:path";

// ─── 引数 ───────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const APP_PATH = getArg("--app", "./src/App.tsx");
const OUT_DIR = getArg("--out", "./osm-out");
const ONLY = getArg("--pref", null);
const REFRESH = args.includes("--refresh");

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "castle-visit-app-osm-survey/1.0 (personal hobby project)";

// JISコード順（ISO3166-2:JP-01〜47 と一致）
const PREFS = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
  "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県",
  "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, "0");

// ─── Overpass クエリ ─────────────────────────────────
// A: historic=castle
// B: 城館系の遺跡（archaeological_site + site_type=fortification）
// C: 名前に「城・砦・陣屋・館跡」を含む史跡類（名前ベースの推定。要確認）
const buildQuery = (code) => `
[out:json][timeout:180];
area["ISO3166-2"="JP-${pad2(code)}"]->.a;
(
  nwr["historic"="castle"](area.a);
  nwr["historic"="archaeological_site"]["site_type"="fortification"](area.a);
  nwr["historic"~"^(ruins|archaeological_site|monument|memorial|fort)$"]["name"~"城|砦|陣屋|館跡"](area.a);
);
out center tags;
`;

async function fetchPref(code) {
  const rawDir = path.join(OUT_DIR, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  const cache = path.join(rawDir, `JP-${pad2(code)}.json`);
  if (!REFRESH && fs.existsSync(cache)) {
    return { json: JSON.parse(fs.readFileSync(cache, "utf8")), fromCache: true };
  }
  const body = "data=" + encodeURIComponent(buildQuery(code));
  let lastErr = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      fs.writeFileSync(cache, JSON.stringify(json));
      return { json, fromCache: false };
    } catch (e) {
      lastErr = e;
      const wait = 10000 * (attempt + 1);
      console.warn(`  ! ${PREFS[code - 1]} 取得失敗(${e.message}) → ${wait / 1000}秒後に再試行`);
      await sleep(wait);
    }
  }
  throw new Error(`${PREFS[code - 1]}: ${lastErr?.message}`);
}

// ─── 整形・重複除去 ──────────────────────────────────
const normName = (s) => (s || "").replace(/[\s　]/g, "").replace(/(城跡|城址|城趾|跡|址|趾|城)$/g, "");

const distKm = (a, b) => {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function classify(tags) {
  if (tags.historic === "castle") return "A";
  if (tags.historic === "archaeological_site" && tags.site_type === "fortification") return "B";
  return "C";
}

function toItems(json, pref) {
  const items = [];
  for (const el of json.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const t = el.tags || {};
    const name = t["name:ja"] || t.name || "";
    items.push({
      id: `${el.type[0]}${el.id}`,
      name,
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      pref,
      conf: classify(t),
      ...(t.castle_type ? { castleType: t.castle_type } : {}),
      ...(t.wikipedia ? { wikipedia: t.wikipedia } : {}), // リンク用のみ（座標には使わない）
    });
  }
  return items;
}

/** 同名で500m以内のものは1件にまとめる（信頼度A>B>Cを優先） */
function dedupe(items) {
  const order = { A: 0, B: 1, C: 2 };
  const sorted = [...items].sort((a, b) => order[a.conf] - order[b.conf]);
  const kept = [];
  for (const it of sorted) {
    const key = normName(it.name);
    const dup = key && kept.some((k) => normName(k.name) === key && distKm(k, it) < 0.5);
    if (!dup) kept.push(it);
  }
  return kept;
}

// ─── 100名城リスト（App.tsx から読み取り） ───────────
function loadMeijo() {
  if (!fs.existsSync(APP_PATH)) {
    console.warn(`(情報) ${APP_PATH} が見つからないため、100名城の網羅チェックはスキップします。--app で指定できます`);
    return [];
  }
  const src = fs.readFileSync(APP_PATH, "utf8");
  const re = /\{\s*no:(\d+),\s*name:"([^"]+)",\s*pref:"([^"]+)"\s*\}/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ no: +m[1], name: m[2], pref: m[3] });
  return out;
}

function checkMeijo(meijo, all) {
  const hit = [], miss = [];
  for (const e of meijo) {
    const key = normName(e.name);
    const found = all.find(
      (c) => c.pref === e.pref && c.name && key.length >= 2 &&
        (normName(c.name).includes(key) || (normName(c.name).length >= 2 && key.includes(normName(c.name))))
    );
    (found ? hit : miss).push(e);
  }
  return { hit, miss };
}

// ─── メイン ──────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const codes = ONLY ? [Number(ONLY)] : PREFS.map((_, i) => i + 1);
  const all = [];
  const perPref = [];

  for (const code of codes) {
    const pref = PREFS[code - 1];
    if (!pref) { console.error(`不正な都道府県コード: ${ONLY}`); process.exit(1); }
    process.stdout.write(`${pad2(code)} ${pref} ... `);
    const { json, fromCache } = await fetchPref(code);
    const items = dedupe(toItems(json, pref));
    all.push(...items);
    const c = (k) => items.filter((i) => i.conf === k).length;
    perPref.push({
      pref, total: items.length, A: c("A"), B: c("B"), C: c("C"),
      unnamed: items.filter((i) => !i.name).length,
    });
    console.log(`${items.length}件 (A:${c("A")} B:${c("B")} C:${c("C")})`);
    if (!fromCache) await sleep(3000); // サーバーへの配慮
  }

  // 保存
  fs.writeFileSync(path.join(OUT_DIR, "castles.json"), JSON.stringify(all));

  // レポート
  const meijo = loadMeijo();
  const { hit, miss } = checkMeijo(meijo, all);
  const sum = (k) => perPref.reduce((s, p) => s + p[k], 0);
  const lines = [];
  lines.push(`# OSM 城跡データ調査レポート`, ``);
  lines.push(`- 総件数: **${all.length}**（A: historic=castle ${sum("A")} / B: 城館系遺跡 ${sum("B")} / C: 名前からの推定 ${sum("C")}）`);
  lines.push(`- 名前なし: ${sum("unnamed")}件`);
  if (meijo.length) {
    lines.push(`- 100名城・続100名城（${meijo.length}件）のうち、同じ県に名前が一致するデータあり: **${hit.length}件** / なし: ${miss.length}件`);
  }
  lines.push(``, `## 都道府県別`, ``, `| 都道府県 | 合計 | A | B | C | 名前なし |`, `|---|---:|---:|---:|---:|---:|`);
  for (const p of perPref) lines.push(`| ${p.pref} | ${p.total} | ${p.A} | ${p.B} | ${p.C} | ${p.unnamed} |`);
  if (miss.length) {
    lines.push(``, `## 100名城のうち一致しなかったもの`, ``);
    lines.push(`（名前の表記ゆれ・別名の可能性もあります）`, ``);
    for (const e of miss) lines.push(`- ${e.no} ${e.name}（${e.pref}）`);
  }
  lines.push(``, `---`, `データ © OpenStreetMap contributors (ODbL)`);
  fs.writeFileSync(path.join(OUT_DIR, "report.md"), lines.join("\n"));

  console.log(`\n完了: ${all.length}件`);
  if (meijo.length) console.log(`100名城の一致: ${hit.length}/${meijo.length}`);
  console.log(`出力: ${path.join(OUT_DIR, "castles.json")} / ${path.join(OUT_DIR, "report.md")}`);
}

main().catch((e) => { console.error("失敗:", e.message); process.exit(1); });
