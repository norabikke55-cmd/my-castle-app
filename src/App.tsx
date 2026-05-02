import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, onSnapshot, doc, deleteDoc, setDoc, writeBatch
} from 'firebase/firestore';
import {
  Search, Calendar, Trash2, Plus, Star, X, Settings,
  Edit3, MapPin, Download, FileUp, ExternalLink,
  Loader2, ArrowUp, ArrowDown, LayoutList, Flag, Map,
  Camera, XCircle, Heart, CheckCircle, Sword
, BarChart2 } from 'lucide-react';
import { db, appId } from "./firebase";

// ─── 定数 ──────────────────────────────────────────────
const FIXED_USER_ID = "toshiyuki";

type PageType = "list" | "prefecture" | "map" | "wishlist" | "stats";
type RecordType = "castle" | "battlefield";
type WishPriority = "高" | "中" | "低";
type WishSortKey = "pref" | "priority";

const PREF_ORDER = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
  "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県",
  "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

const PREF_COORDS: Record<string, [number, number]> = {
  "北海道":[43.064,141.347],"青森県":[40.824,140.740],"岩手県":[39.703,141.153],
  "宮城県":[38.269,140.872],"秋田県":[39.719,140.102],"山形県":[38.240,140.363],
  "福島県":[37.750,140.468],"茨城県":[36.342,140.447],"栃木県":[36.566,139.883],
  "群馬県":[36.391,139.060],"埼玉県":[35.857,139.649],"千葉県":[35.605,140.123],
  "東京都":[35.690,139.692],"神奈川県":[35.447,139.642],"新潟県":[37.902,139.023],
  "富山県":[36.695,137.211],"石川県":[36.594,136.626],"福井県":[36.065,136.222],
  "山梨県":[35.664,138.568],"長野県":[36.651,138.181],"岐阜県":[35.391,136.722],
  "静岡県":[34.977,138.383],"愛知県":[35.180,136.907],"三重県":[34.730,136.509],
  "滋賀県":[35.004,135.869],"京都府":[35.021,135.756],"大阪府":[34.686,135.520],
  "兵庫県":[34.691,135.183],"奈良県":[34.685,135.833],"和歌山県":[34.226,135.168],
  "鳥取県":[35.504,134.238],"島根県":[35.472,133.051],"岡山県":[34.661,133.935],
  "広島県":[34.396,132.459],"山口県":[34.186,131.471],"徳島県":[34.066,134.559],
  "香川県":[34.340,134.043],"愛媛県":[33.842,132.766],"高知県":[33.560,133.531],
  "福岡県":[33.607,130.418],"佐賀県":[33.249,130.299],"長崎県":[32.745,129.874],
  "熊本県":[32.790,130.742],"大分県":[33.239,131.613],"宮崎県":[31.911,131.424],
  "鹿児島県":[31.560,130.558],"沖縄県":[26.212,127.681],
};

const PRIORITY_ORDER: Record<WishPriority, number> = { "高": 0, "中": 1, "低": 2 };

const PRIORITY_STYLE: Record<WishPriority, string> = {
  "高": "bg-rose-50 text-rose-700 border-rose-200",
  "中": "bg-amber-50 text-amber-700 border-amber-200",
  "低": "bg-stone-50 text-stone-500 border-stone-200",
};

const stableHash = (str: string): number => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
};

// ① 五十音順ソート用comparator
const jaSort = (a: string, b: string) =>
  (a || "").localeCompare(b || "", "ja", { sensitivity: "base" });

// ─── 座標取得ユーティリティ ────────────────────────────

// 都道府県ごとの緯度経度の大まかな範囲（lat_min, lat_max, lng_min, lng_max）
const PREF_BOUNDS: Record<string, [number, number, number, number]> = {
  "北海道":[41.3,45.6,139.3,145.9],"青森県":[40.1,41.6,139.8,141.7],"岩手県":[38.7,40.5,140.6,142.1],
  "宮城県":[37.7,39.0,140.2,141.7],"秋田県":[38.9,40.5,139.6,141.1],"山形県":[37.7,39.1,139.6,140.9],
  "福島県":[36.8,37.9,136.8,141.1],"茨城県":[35.7,36.9,139.7,140.9],"栃木県":[36.2,37.2,139.3,140.4],
  "群馬県":[35.9,37.1,138.4,139.7],"埼玉県":[35.7,36.3,138.7,139.9],"千葉県":[35.0,35.9,139.7,140.9],
  "東京都":[35.5,35.9,138.9,139.9],"神奈川県":[35.1,35.7,139.0,139.8],"新潟県":[36.7,38.7,137.6,139.9],
  "富山県":[36.4,36.9,136.8,137.7],"石川県":[36.1,37.9,136.3,137.4],"福井県":[35.4,36.3,135.5,136.7],
  "山梨県":[35.2,35.9,138.2,139.0],"長野県":[35.2,37.0,136.9,138.8],"岐阜県":[35.1,36.6,136.3,137.7],
  "静岡県":[34.6,35.6,137.5,139.2],"愛知県":[34.6,35.4,136.7,137.8],"三重県":[33.7,35.2,135.9,136.9],
  "滋賀県":[34.8,35.7,135.7,136.4],"京都府":[34.7,35.8,135.0,135.9],"大阪府":[34.3,34.9,135.1,135.8],
  "兵庫県":[34.1,35.7,134.2,135.5],"奈良県":[33.9,34.8,135.6,136.3],"和歌山県":[33.4,34.4,135.1,136.0],
  "鳥取県":[35.0,35.6,133.2,134.6],"島根県":[34.3,35.8,131.7,133.5],"岡山県":[34.3,35.3,133.2,134.5],
  "広島県":[33.9,35.2,132.0,133.4],"山口県":[33.7,34.8,130.8,132.1],"徳島県":[33.5,34.3,133.7,134.8],
  "香川県":[34.1,34.5,133.5,134.4],"愛媛県":[32.9,34.2,131.9,133.7],"高知県":[32.7,33.9,132.5,134.3],
  "福岡県":[33.1,34.2,130.0,131.2],"佐賀県":[33.0,33.6,129.7,130.6],"長崎県":[32.5,34.7,128.6,130.3],
  "熊本県":[32.0,33.2,130.1,131.4],"大分県":[32.7,33.7,130.7,132.1],"宮崎県":[31.4,32.9,130.7,132.1],
  "鹿児島県":[30.0,32.3,129.3,131.3],"沖縄県":[24.0,27.1,122.9,131.4],
};

// 座標が指定都道府県の範囲内にあるかチェック
const isInPref = (lat: number, lng: number, pref: string): boolean => {
  const bounds = PREF_BOUNDS[pref];
  if (!bounds) return true; // 範囲データなければスキップ
  return lat >= bounds[0] && lat <= bounds[1] && lng >= bounds[2] && lng <= bounds[3];
};

// 日本国内の座標かチェック（おおよその範囲）
const isInJapan = (lat: number, lng: number): boolean =>
  lat >= 24 && lat <= 46 && lng >= 122 && lng <= 154;

// 座標取得のメイン関数（ブラウザSDK版・HTTPリファラー制限を回避）
const resolveCoords = (name: string, address: string, pref: string): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    const google = (window as any).google;
    if (!google?.maps?.Geocoder) { resolve(null); return; }

    const geocoder = new google.maps.Geocoder();

    // タイムアウト付きのジオコード（5秒で諦めてnullを返す）
    const geocodeOne = (query: string): Promise<{ lat: number; lng: number } | null> =>
      new Promise(res => {
        const timer = setTimeout(() => res(null), 5000); // 5秒タイムアウト
        geocoder.geocode({ address: query, region: "jp" }, (results: any, status: any) => {
          clearTimeout(timer);
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            const lat = loc.lat(), lng = loc.lng();
            if (isInJapan(lat, lng)) res({ lat, lng });
            else res(null);
          } else res(null);
        });
      });

    // 住所 → 都道府県+城名 → 城名のみ の順で試行
    (async () => {
      if (address) {
        const query = (pref && !address.startsWith(pref)) ? `${pref}${address}` : address;
        const r = await geocodeOne(query);
        if (r) { resolve(r); return; }
      }
      if (pref) {
        const r = await geocodeOne(`${pref} ${name}`);
        if (r) { resolve(r); return; }
      }
      const r = await geocodeOne(name);
      resolve(r ?? null);
    })();
  });
};
const MAX_BYTES = 50 * 1024;

const compressImage = (file: File, maxSide: number, quality: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const processPhoto = async (file: File): Promise<{ data: string; error?: string }> => {
  let data = await compressImage(file, 400, 0.70);
  if (Math.round((data.length * 3) / 4) <= MAX_BYTES) return { data };
  data = await compressImage(file, 300, 0.60);
  const bytes = Math.round((data.length * 3) / 4);
  if (bytes <= MAX_BYTES) return { data };
  return { data: "", error: `圧縮後も ${Math.round(bytes / 1024)}KB になりました。より小さい画像を選んでください。` };
};

// ─── 共通コンポーネント ─────────────────────────────────

const CastleIcon = () => (
  <div className="relative w-12 h-12 flex items-center justify-center">
    <svg viewBox="0 0 100 100" className="w-10 h-10" fill="none">
      <rect x="0" y="0" width="100" height="100" rx="18" fill="#D2B48C" />
      <circle cx="20" cy="25" r="8" fill="white" fillOpacity="0.3" />
      <path d="M10 90 L90 90 L80 60 L20 60 Z" fill="#57534e" />
      <path d="M20 60 L80 60 L75 55 L25 55 Z" fill="#44403c" />
      <rect x="30" y="38" width="40" height="18" fill="#ffffff" />
      <path d="M25 38 L75 38 L70 32 L30 32 Z" fill="#292524" />
      <rect x="37" y="22" width="26" height="12" fill="#ffffff" />
      <path d="M35 22 L65 22 L60 14 L40 14 Z" fill="#292524" />
      <rect x="38" y="44" width="6" height="6" fill="#1c1917" />
      <rect x="56" y="44" width="6" height="6" fill="#1c1917" />
      <rect x="47" y="26" width="6" height="6" fill="#1c1917" />
    </svg>
  </div>
);

const Stars = ({ rating, size = 12 }: { rating: number; size?: number }) => (
  <div className="flex gap-0.5 items-center shrink-0">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} size={size}
        className={n <= (rating || 5) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"} />
    ))}
  </div>
);

// ─── 都道府県一覧ページ ─────────────────────────────────

const PrefecturePage = ({ castles }: { castles: any[] }) => {
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    castles.forEach((c) => {
      const pref = c.pref || "未設定";
      if (!map[pref]) map[pref] = [];
      map[pref].push(c);
    });
    const result: { pref: string; items: any[] }[] = [];
    PREF_ORDER.forEach((p) => { if (map[p]) result.push({ pref: p, items: map[p] }); });
    if (map["未設定"]) result.push({ pref: "未設定", items: map["未設定"] });
    return result;
  }, [castles]);

  const visitedPrefs = new Set(castles.map((c) => c.pref).filter(Boolean));
  const unvisitedPrefs = PREF_ORDER.filter((p) => !visitedPrefs.has(p));

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6" style={{ paddingBottom: "160px" }}>
      <div className="mb-6 p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-0.5">訪問都道府県</p>
          <p className="text-3xl font-black text-stone-900">
            {grouped.length}<span className="text-sm font-normal text-stone-400 ml-1">/ 47</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">合計</p>
          <p className="text-3xl font-black text-stone-900">
            {castles.length}<span className="text-sm font-normal text-stone-400 ml-1">件</span>
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {grouped.map(({ pref, items }) => (
          <div key={pref} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-stone-400">{pref}</h3>
              <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {items.length} 件
              </span>
            </div>
            <div className="divide-y divide-stone-50">
              {[...items].sort((a, b) => (b.rating || 5) - (a.rating || 5)).map((castle) => (
                <div key={castle.id} className="pl-10 pr-5 py-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {castle.recordType === "battlefield" && <Sword size={11} className="text-stone-400 shrink-0" />}
                    <span className="text-sm font-bold text-stone-800 truncate">{castle.name}</span>
                  </div>
                  <Stars rating={castle.rating || 5} size={11} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {unvisitedPrefs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black text-stone-300 uppercase tracking-widest">未訪問</span>
            <span className="text-[10px] font-black text-stone-300">{unvisitedPrefs.length} 県</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unvisitedPrefs.map((pref) => (
              <span key={pref} className="text-[11px] font-bold text-stone-300 bg-stone-50 border border-stone-100 px-3 py-1 rounded-full">
                {pref}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── マップページ ───────────────────────────────────────

// ─── マップページ（Google Maps） ───────────────────────

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Google Geocoding API で住所から座標取得（高精度）
const fetchCoordsFromGoogleGeocoding = async (query: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&language=ja&region=jp`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) return null;
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch { return null; }
};


// ─── 統計ページ ────────────────────────────────────────
const StatsPage = ({ castles }: { castles: any[] }) => {
  const visited = castles.filter(c => c.recordType !== "battlefield");
  const battlefields = castles.filter(c => c.recordType === "battlefield");

  // 訪問年別集計
  const yearData = useMemo(() => {
    const map: Record<string, { castle: number; battlefield: number }> = {};
    castles.forEach(c => {
      const raw = c.visitDate || "";
      const year = raw.slice(0, 4);
      if (!year || isNaN(Number(year)) || Number(year) < 1990) return;
      if (!map[year]) map[year] = { castle: 0, battlefield: 0 };
      if (c.recordType === "battlefield") map[year].battlefield++;
      else map[year].castle++;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([year, v]) => ({ year, ...v, total: v.castle + v.battlefield }));
  }, [castles]);

  const maxYear = Math.max(...yearData.map(d => d.total), 1);

  // 評価分布
  const ratingData = useMemo(() => {
    const map: Record<number, number> = {1:0,2:0,3:0,4:0,5:0};
    visited.forEach(c => { const r = c.rating || 3; if (map[r] !== undefined) map[r]++; });
    return Object.entries(map).map(([r, count]) => ({ rating: Number(r), count }));
  }, [visited]);
  const maxRating = Math.max(...ratingData.map(d => d.count), 1);

  // 都道府県TOP5
  const prefTop = useMemo(() => {
    const map: Record<string, number> = {};
    visited.forEach(c => { if (c.pref) map[c.pref] = (map[c.pref] || 0) + 1; });
    return Object.entries(map).sort(([,a],[,b]) => b - a).slice(0, 5);
  }, [visited]);
  const maxPref = Math.max(...prefTop.map(([,v]) => v), 1);

  const ratingColors: Record<number,string> = {1:"#9ca3af",2:"#6b7280",3:"#7c6a56",4:"#d97706",5:"#B7410E"};

  return (
    <div className="space-y-6 pb-24">
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "訪問城郭", value: visited.length, unit: "城", color: "#B7410E", emoji: "🏯" },
          { label: "古戦場", value: battlefields.length, unit: "箇所", color: "#7c6a56", emoji: "⚔️" },
          { label: "訪問都道府県", value: new Set(visited.map(c=>c.pref).filter(Boolean)).size, unit: "県", color: "#d97706", emoji: "🗾" },
          { label: "5つ星の城", value: visited.filter(c=>c.rating===5).length, unit: "城", color: "#f59e0b", emoji: "⭐" },
        ].map(({ label, value, unit, color, emoji }) => (
          <div key={label} className="bg-white rounded-[20px] p-4 shadow-sm border border-stone-100">
            <div className="text-2xl mb-1">{emoji}</div>
            <div className="text-2xl font-black" style={{ color }}>{value}<span className="text-sm font-normal text-stone-400 ml-1">{unit}</span></div>
            <div className="text-[11px] text-stone-400 font-black">{label}</div>
          </div>
        ))}
      </div>

      {/* 訪問年グラフ */}
      {yearData.length > 0 && (
        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-stone-100">
          <h3 className="font-black text-stone-800 mb-4 text-sm">📅 訪問年別</h3>
          <div className="space-y-2">
            {yearData.map(({ year, castle, battlefield, total }) => (
              <div key={year} className="flex items-center gap-3">
                <div className="text-[11px] font-black text-stone-500 w-10 shrink-0">{year}</div>
                <div className="flex-1 flex gap-0.5 h-6 rounded overflow-hidden bg-stone-50">
                  {castle > 0 && (
                    <div className="h-full flex items-center justify-end pr-1 transition-all"
                      style={{ width: `${(castle/maxYear)*100}%`, background: "#B7410E", minWidth: castle > 0 ? "20px" : "0" }}>
                      <span className="text-white text-[9px] font-black">{castle}</span>
                    </div>
                  )}
                  {battlefield > 0 && (
                    <div className="h-full flex items-center justify-end pr-1 transition-all"
                      style={{ width: `${(battlefield/maxYear)*100}%`, background: "#7c6a56", minWidth: battlefield > 0 ? "20px" : "0" }}>
                      <span className="text-white text-[9px] font-black">{battlefield}</span>
                    </div>
                  )}
                </div>
                <div className="text-[11px] font-black text-stone-600 w-6 shrink-0">{total}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{background:"#B7410E"}}></div><span className="text-[10px] text-stone-400">城郭</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{background:"#7c6a56"}}></div><span className="text-[10px] text-stone-400">古戦場</span></div>
          </div>
        </div>
      )}

      {/* 評価分布 */}
      <div className="bg-white rounded-[20px] p-5 shadow-sm border border-stone-100">
        <h3 className="font-black text-stone-800 mb-4 text-sm">⭐ 評価分布</h3>
        <div className="space-y-2">
          {ratingData.slice().reverse().map(({ rating, count }) => (
            <div key={rating} className="flex items-center gap-3">
              <div className="flex shrink-0">
                {[1,2,3,4,5].map(n => (
                  <span key={n} style={{ color: n <= rating ? ratingColors[rating] : "#e5e7eb", fontSize: "13px" }}>★</span>
                ))}
              </div>
              <div className="flex-1 bg-stone-50 rounded overflow-hidden h-5">
                <div className="h-full flex items-center justify-end pr-1 transition-all"
                  style={{ width: `${(count/maxRating)*100}%`, background: ratingColors[rating], minWidth: count > 0 ? "24px" : "0" }}>
                  {count > 0 && <span className="text-white text-[9px] font-black">{count}</span>}
                </div>
              </div>
              <div className="text-[11px] text-stone-400 w-8 shrink-0">{count}城</div>
            </div>
          ))}
        </div>
      </div>

      {/* 都道府県TOP5 */}
      {prefTop.length > 0 && (
        <div className="bg-white rounded-[20px] p-5 shadow-sm border border-stone-100">
          <h3 className="font-black text-stone-800 mb-4 text-sm">🗾 都道府県TOP5</h3>
          <div className="space-y-2">
            {prefTop.map(([pref, count], i) => (
              <div key={pref} className="flex items-center gap-3">
                <div className="text-[11px] font-black w-5 shrink-0" style={{ color: i===0?"#B7410E":i===1?"#d97706":i===2?"#7c6a56":"#9ca3af" }}>
                  {i+1}
                </div>
                <div className="text-[11px] font-black text-stone-700 w-20 shrink-0">{pref}</div>
                <div className="flex-1 bg-stone-50 rounded overflow-hidden h-5">
                  <div className="h-full flex items-center justify-end pr-1 transition-all"
                    style={{ width: `${(count/maxPref)*100}%`, background: i===0?"#B7410E":i===1?"#d97706":i===2?"#7c6a56":"#9ca3af", minWidth: "24px" }}>
                    <span className="text-white text-[9px] font-black">{count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const MapPage = ({ castles, wishes, onCastleSelect, focusCastleId, onFocusHandled, isVisible }: {
  castles: any[];
  wishes?: any[];
  onCastleSelect: (castle: any) => void;
  focusCastleId?: string | null;
  onFocusHandled?: () => void;
  isVisible?: boolean;
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapSearch, setMapSearch] = useState("");
  const mapSearchRef = useRef<HTMLInputElement>(null);
  const [editingCoord, setEditingCoord] = useState<any>(null);
  const coordMapRef = useRef<HTMLDivElement>(null);
  const coordMapInstanceRef = useRef<any>(null);
  const [coordLatLng, setCoordLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const geocodedWishIdsRef = useRef<Set<string>>(new Set()); // ジオコード済みwish IDを記録（ループ防止）
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  // Google Maps 初期化
  useEffect(() => {
    const initMap = () => {
      const google = (window as any).google;
      if (!mapRef.current || mapInstanceRef.current || !google?.maps) return;
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: 35.180, lng: 136.907 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      });

      // スタイル調整（ポップアップ余白削減・ボタン文字縮小）
      const style = document.createElement("style");
      style.id = "gmap-custom-style";
      if (!document.getElementById("gmap-custom-style")) {
        style.textContent = `
          .gm-style .gm-style-iw-c { padding: 0 !important; min-width: 0 !important; box-shadow: 0 2px 12px rgba(0,0,0,0.2) !important; }
          .gm-style .gm-style-iw-d { overflow: hidden !important; padding: 8px 28px 8px 10px !important; }
          .gm-style-iw-ch { display: none !important; }
          .gm-ui-hover-effect { position: absolute !important; top: 4px !important; right: 2px !important; width: 20px !important; height: 20px !important; opacity: 0.6 !important; }
          .gm-ui-hover-effect span { width: 12px !important; height: 12px !important; margin: 4px !important; }
        `;
        document.head.appendChild(style);
      }

      mapInstanceRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow({ disableAutoPan: false });
      setMapReady(true);
    };

    const scriptId = "google-maps-script";
    if ((window as any).google?.maps) { initMap(); }
    else if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&language=ja`;
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      document.getElementById(scriptId)!.addEventListener("load", initMap);
    }

    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      // mapInstanceRef・infoWindowRef はここでnullにしない
      // （nullにするとコンポーネント再レンダリング時に再初期化ループが発生する）
    };
  }, []);

  // mapType切り替え
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setMapTypeId(mapType);
  }, [mapType]);

  // フォーカス処理（display:noneをやめたのでresizeは不要。シンプルに城へ飛ぶだけ）
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const targetId = focusCastleId || pendingFocusRef.current;
    if (!targetId) return;

    pendingFocusRef.current = null;
    const castle = castles.find((c: any) => c.id === targetId);
    if (!castle) { onFocusHandled?.(); return; }

    if (castle.lat && castle.lng) {
      map.setCenter({ lat: castle.lat, lng: castle.lng });
      map.setZoom(14);
      setTimeout(() => {
        const marker = markersRef.current.find(m => (m as any)._castleId === targetId);
        if (marker) openInfoWindow(castle, marker);
      }, 200);
    } else {
      const prefCoords = PREF_COORDS[castle.pref];
      if (prefCoords) {
        map.setCenter({ lat: prefCoords[0], lng: prefCoords[1] });
        map.setZoom(11);
      }
    }
    onFocusHandled?.();
  }, [focusCastleId, mapReady]);

  // isVisible変化時：フォーカスなしでマップタブに来た時だけ名古屋にリセット
  useEffect(() => {
    if (!isVisible || !mapReady || !mapInstanceRef.current) return;
    if (!focusCastleId && !pendingFocusRef.current) {
      infoWindowRef.current?.close();
      mapInstanceRef.current.setCenter({ lat: 35.180, lng: 136.907 });
      mapInstanceRef.current.setZoom(10);
    }
  }, [isVisible]);

  // ③ ポップアップ：×ボタンと城名同行、位置修正を★と同行
  const openInfoWindow = (castle: any, marker: any) => {
    const google = (window as any).google;
    if (!infoWindowRef.current || !mapInstanceRef.current) return;
    const starsHtml = [1,2,3,4,5].map(n =>
      `<span style="color:${n<=(castle.rating||5)?"#F59E0B":"#e5e7eb"};font-size:12px">★</span>`
    ).join("");
    infoWindowRef.current.setContent(`
      <div style="font-family:sans-serif;padding:2px 4px 4px 0;min-width:120px;max-width:180px">
        <div id="iw-name-${castle.id}" style="font-weight:900;font-size:13px;margin-bottom:2px;color:#B7410E;cursor:pointer;text-decoration:underline;line-height:1.3;padding-right:4px">${castle.name}</div>
        <div style="font-size:10px;color:#78716c;margin-bottom:2px;display:flex;flex-wrap:wrap;gap:4px;">
          ${castle.recordType==="battlefield"?`<span style="color:#7c6a56;font-weight:700">古戦場</span>`:""}
          ${castle.province?`<span style="color:#92400e;font-weight:700">${castle.province}国</span>`:""}
          ${castle.pref?`<span>${castle.pref}</span>`:""}
        </div>
        ${castle.visitDate?`<div style="font-size:10px;color:#666;margin-bottom:2px">📅 ${castle.visitDate}</div>`:""}
        <div style="display:flex;align-items:center;gap:8px;">
          <div>${starsHtml}</div>
          <span id="iw-edit-${castle.id}" style="font-size:10px;color:#B7410E;cursor:pointer;text-decoration:underline;font-weight:bold;white-space:nowrap">位置修正</span>
        </div>
      </div>`);
    infoWindowRef.current.open(mapInstanceRef.current, marker);
    google.maps.event.addListenerOnce(infoWindowRef.current, "domready", () => {
      const nameEl = document.getElementById(`iw-name-${castle.id}`);
      if (nameEl) nameEl.addEventListener("click", () => onCastleSelect(castle));
      const editEl = document.getElementById(`iw-edit-${castle.id}`);
      if (editEl) editEl.addEventListener("click", () => {
        infoWindowRef.current?.close();
        setEditingCoord(castle);
        setCoordLatLng(castle.lat && castle.lng ? { lat: castle.lat, lng: castle.lng } : null);
      });
    });
  };

  // マーカー更新
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const google = (window as any).google;
    markersRef.current.forEach(m => m.setMap(null)); markersRef.current = [];

    const markerColor = (r: number) =>
      r >= 5 ? "#B7410E" : r >= 4 ? "#d97706" : r >= 3 ? "#7c6a56" : "#9ca3af";
    const markerScale = (r: number) =>
      r >= 5 ? 14 : r >= 4 ? 12 : r >= 3 ? 10 : 8;

    const term = mapSearch.trim().toLowerCase();
    const filtered = term
      ? castles.filter(c => (c.name+(c.aka||"")+(c.pref||"")).toLowerCase().includes(term))
      : castles;

    filtered.forEach((castle) => {
      let lat: number, lng: number;
      if (castle.lat && castle.lng) { lat = castle.lat; lng = castle.lng; }
      else {
        const coords = PREF_COORDS[castle.pref]; if (!coords) return;
        const h = stableHash(castle.id || castle.name);
        lat = coords[0] + (((h & 0xff) - 128) / 128) * 0.22;
        lng = coords[1] + ((((h >> 8) & 0xff) - 128) / 128) * 0.22;
      }

      const isBattlefield = castle.recordType === "battlefield";
      const rating = castle.rating || 3;
      const color = markerColor(rating);

      // SVGピンマーカー（城は🏯、合戦地は⚔️を中に入れた目立つピン型）
      const pinSize = 36 + (rating - 1) * 3; // 評価に応じて36〜48px
      const emoji = isBattlefield ? "⚔️" : "🏯";
      const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="${pinSize}" height="${pinSize + 10}" viewBox="0 0 48 58">
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
        </filter>
        <path d="M24 0C13.5 0 5 8.5 5 19c0 14 19 39 19 39s19-25 19-39C43 8.5 34.5 0 24 0z"
          fill="${color}" stroke="#fff" stroke-width="2.5" filter="url(#shadow)"/>
        <circle cx="24" cy="19" r="11" fill="rgba(255,255,255,0.9)"/>
        <text x="24" y="24" text-anchor="middle" font-size="13">${emoji}</text>
      </svg>`;
      const svgUrl = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svgPin);

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        icon: {
          url: svgUrl,
          scaledSize: new google.maps.Size(pinSize, pinSize + 10),
          anchor: new google.maps.Point(pinSize / 2, pinSize + 10), // ピンの先端を座標に合わせる
        },
        title: castle.name,
        optimized: false, // SVGはoptimized:falseが必要
        zIndex: rating * 10, // 高評価が手前に
      });

      marker.addListener("click", () => openInfoWindow(castle, marker));
      (marker as any)._castleId = castle.id;
      markersRef.current.push(marker);
    });

    // ウィッシュリストマーカー（緑ピン）
    if (wishes && wishes.length > 0) {
      const wishFiltered = term
        ? wishes.filter((w: any) => (w.name+(w.pref||"")).toLowerCase().includes(term))
        : wishes;

      const placeWishMarker = (wish: any, lat: number, lng: number) => {
        const emoji = wish.wishType === "battlefield" ? "⚔️" : "🏯";
        const svgWish = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 48 58">
          <filter id="ws" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
          </filter>
          <path d="M24 0C13.5 0 5 8.5 5 19c0 14 19 39 19 39s19-25 19-39C43 8.5 34.5 0 24 0z"
            fill="#16a34a" stroke="#fff" stroke-width="2.5" filter="url(#ws)"/>
          <circle cx="24" cy="19" r="11" fill="rgba(255,255,255,0.9)"/>
          <text x="24" y="24" text-anchor="middle" font-size="12">${emoji}</text>
        </svg>`;
        const wUrl = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svgWish);
        const wMarker = new google.maps.Marker({
          position: { lat, lng }, map: mapInstanceRef.current,
          icon: { url: wUrl, scaledSize: new google.maps.Size(34, 44), anchor: new google.maps.Point(17, 44) },
          title: wish.name, optimized: false, zIndex: 1,
        });
        wMarker.addListener("click", () => {
          const iw = infoWindowRef.current; if (!iw) return;
          iw.setContent(`<div style="font-family:sans-serif;padding:2px 4px 4px 0;min-width:120px;max-width:180px">
            <div style="font-weight:900;font-size:13px;color:#16a34a">⭐ 行きたい</div>
            <div style="font-weight:900;font-size:13px;color:#374151">${wish.name}</div>
            ${wish.pref ? `<div style="font-size:11px;color:#6b7280">${wish.pref}</div>` : ""}
            ${wish.address ? `<div style="font-size:10px;color:#9ca3af">${wish.address}</div>` : ""}
            <div style="margin-top:6px">
              <span id="iw-wish-edit-${wish.id}" style="font-size:10px;color:#16a34a;cursor:pointer;text-decoration:underline;font-weight:bold">位置修正</span>
            </div>
          </div>`);
          iw.open(mapInstanceRef.current, wMarker);
          // 位置修正ボタンのクリックイベント（DOM生成後に登録）
          google.maps.event.addListenerOnce(iw, "domready", () => {
            const btn = document.getElementById(`iw-wish-edit-${wish.id}`);
            if (btn) btn.addEventListener("click", () => {
              iw.close();
              const lat = wMarker.getPosition()?.lat() ?? wish.lat;
              const lng = wMarker.getPosition()?.lng() ?? wish.lng;
              setCoordLatLng(lat && lng ? { lat, lng } : null);
              setEditingCoord({ ...wish, _collection: "wishes" });
            });
          });
        });
        (wMarker as any)._wishId = wish.id;
        markersRef.current.push(wMarker);
      };

      const geocoder = new google.maps.Geocoder();
      wishFiltered.forEach((wish: any) => {
        if (wish.lat && wish.lng) {
          // 座標済み：そのまま表示
          placeWishMarker(wish, wish.lat, wish.lng);
        } else if (wish.address || wish.pref) {
          // 住所からジオコード（表示のみ・DBには保存しない）
          const query = wish.address
            ? (wish.pref && !wish.address.startsWith(wish.pref) ? wish.pref + wish.address : wish.address)
            : `${wish.pref} ${wish.name}`;
          // すでにジオコード済みならスキップ（DBへの保存→wishes更新→再実行のループ防止）
          if (geocodedWishIdsRef.current.has(wish.id)) return;
          geocodedWishIdsRef.current.add(wish.id);
          geocoder.geocode({ address: query, region: "jp" }, async (results: any, status: any) => {
            if (status === "OK" && results?.[0]) {
              const loc = results[0].geometry.location;
              const lat = loc.lat(), lng = loc.lng();
              placeWishMarker(wish, lat, lng);
              // 取得した座標をDBに保存（次回から座標ありとして即表示）
              try {
                const ref = doc(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes", wish.id);
                await setDoc(ref, { ...wish, lat, lng, updatedAt: new Date().toISOString() });
              } catch (e) { console.error("wish座標保存失敗", e); }
            } else {
              // ジオコード失敗時は都道府県中心にフォールバック（DBには保存しない）
              geocodedWishIdsRef.current.delete(wish.id); // 失敗時はRefから削除して次回再試行可能に
              const coords = PREF_COORDS[wish.pref];
              if (coords) {
                const h = stableHash(wish.id || wish.name);
                const lat = coords[0] + (((h & 0xff) - 128) / 128) * 0.15;
                const lng = coords[1] + ((((h >> 8) & 0xff) - 128) / 128) * 0.15;
                placeWishMarker(wish, lat, lng);
              }
            }
          });
        }
      });
    }

    if (term && markersRef.current.length === 1) {
      const pos = markersRef.current[0].getPosition();
      mapInstanceRef.current.setCenter(pos);
      mapInstanceRef.current.setZoom(13);
      openInfoWindow(filtered[0], markersRef.current[0]);
    } else if (term && markersRef.current.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      markersRef.current.forEach(m => bounds.extend(m.getPosition()));
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [castles, wishes, mapReady, mapSearch]);

  // 座標編集マップ
  useEffect(() => {
    if (!editingCoord) return;
    const google = (window as any).google;
    setTimeout(() => {
      if (!coordMapRef.current || coordMapInstanceRef.current) return;
      const initLat = coordLatLng?.lat ?? 35.180;
      const initLng = coordLatLng?.lng ?? 136.907;
      const cmap = new google.maps.Map(coordMapRef.current, {
        center: { lat: initLat, lng: initLng },
        zoom: 14,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControlOptions: {
          mapTypeIds: ["roadmap", "satellite"],
          position: google.maps.ControlPosition.TOP_RIGHT,
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        },
      });
      const cmarker = new google.maps.Marker({
        position: { lat: initLat, lng: initLng },
        map: cmap, draggable: true, title: editingCoord.name,
      });
      cmarker.addListener("dragend", () => {
        const pos = cmarker.getPosition();
        setCoordLatLng({ lat: pos.lat(), lng: pos.lng() });
      });
      cmap.addListener("click", (e: any) => {
        cmarker.setPosition(e.latLng);
        setCoordLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      coordMapInstanceRef.current = cmap;
    }, 100);
    return () => { coordMapInstanceRef.current = null; };
  }, [editingCoord]);

  const filteredCount = mapSearch.trim()
    ? castles.filter(c => (c.name+(c.aka||"")+(c.pref||"")).toLowerCase().includes(mapSearch.trim().toLowerCase())).length
    : castles.length;

  return (
    <div className="relative" style={{ height: "calc(100vh - 120px)" }}>
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-50 z-10">
          <Loader2 className="animate-spin text-stone-300 mb-3" size={32} />
          <span className="text-xs font-black text-stone-300 uppercase tracking-widest">マップ読み込み中...</span>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
      {mapReady && (
        <>
        {/* 検索バー + 地図切り替えボタン（上部中央） */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[10] flex items-start gap-2" style={{ width: "calc(50% + 56px)", minWidth: "220px", maxWidth: "324px" }}>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
              <input ref={mapSearchRef} type="text" placeholder="城名・県名..."
                className="w-full pl-7 pr-6 py-2 bg-white/95 backdrop-blur-sm rounded-xl text-xs border border-stone-200 shadow-md outline-none focus:border-amber-300"
                value={mapSearch} onChange={(e) => setMapSearch(e.target.value)} />
              {mapSearch && (
                <button onClick={() => setMapSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                  <X size={12} />
                </button>
              )}
            </div>
            {/* 地図/航空写真 切り替えボタン */}
            <button
              onClick={() => setMapType(t => t === "roadmap" ? "satellite" : "roadmap")}
              className="shrink-0 h-[33px] px-2.5 bg-white/95 backdrop-blur-sm rounded-xl border border-stone-200 shadow-md text-[10px] font-black text-stone-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-all whitespace-nowrap flex items-center gap-1"
              title={mapType === "roadmap" ? "航空写真に切り替え" : "地図に切り替え"}
            >
              {mapType === "roadmap" ? "🛰 衛星" : "🗺 地図"}
            </button>
            {mapSearch && (
              <div className="absolute top-full left-0 mt-1 text-center text-[10px] font-black text-stone-500 bg-white/90 rounded-lg py-0.5 shadow" style={{ width: "calc(100% - 64px)" }}>{filteredCount} 件</div>
            )}
          </div>

          {/* 凡例（左下） */}
          <div className="absolute bottom-10 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-md border border-stone-200 z-[10]">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5">評価</p>
            {[
              { color: "#B7410E", size: 16, label: "★★★★★" },
              { color: "#d97706", size: 13, label: "★★★★" },
              { color: "#7c6a56", size: 10, label: "★★★" },
              { color: "#9ca3af", size: 8,  label: "★★以下" },
            ].map(({ color, size, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1 last:mb-0">
                <div style={{ background: color, width: size, height: size, borderRadius: "50%", border: "2px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", flexShrink: 0 }} />
                <span className="text-[10px] font-bold text-stone-600">{label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 手動座標編集モーダル */}
      {editingCoord && (
        <div className="absolute inset-0 bg-stone-900/70 z-[2000] flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-[32px] md:rounded-[32px] shadow-2xl flex flex-col" style={{ maxHeight: "92vh" }}>
            <div className="px-6 py-4 border-b border-stone-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-stone-900">{editingCoord.name}</h3>
                <p className="text-[10px] text-stone-400 mt-0.5">マーカーをドラッグ、または地図をタップして位置を指定</p>
              </div>
              <button onClick={() => { setEditingCoord(null); setCoordLatLng(null); }}
                className="p-2 text-stone-300 hover:text-stone-800 bg-stone-50 rounded-full"><X size={20} /></button>
            </div>
            <div ref={coordMapRef} style={{ flexGrow: 1, minHeight: "420px" }} />
            <div className="p-4 space-y-3 shrink-0">
              {coordLatLng && (
                <p className="text-[11px] text-stone-400 text-center font-mono">
                  {coordLatLng.lat.toFixed(6)}, {coordLatLng.lng.toFixed(6)}
                </p>
              )}
              <button onClick={async () => {
                if (!coordLatLng) return;
                const col = editingCoord._collection || "castles";
                const { _collection, ...saveData } = editingCoord;
                const ref = doc(db, "artifacts", appId, "users", FIXED_USER_ID, col, saveData.id);
                await setDoc(ref, { ...saveData, lat: coordLatLng.lat, lng: coordLatLng.lng, manualCoord: true, updatedAt: new Date().toISOString() });
                // wishの場合はジオコード済みキャッシュをクリアして次回再表示に備える
                if (col === "wishes") geocodedWishIdsRef.current.delete(saveData.id);
                setEditingCoord(null); setCoordLatLng(null);
              }} className="w-full bg-[#B7410E] text-white py-3 rounded-[18px] font-black text-sm hover:bg-[#9a3509] transition-all">
                この位置で保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



// ─── ウィッシュリストページ ─────────────────────────────

const WishlistPage = ({ wishes, onEdit, onDelete, onVisited }: {
  wishes: any[];
  onEdit: (w: any) => void;
  onDelete: (id: string, name: string) => void;
  onVisited: (w: any) => void;
}) => {
  const [sortKey, setSortKey] = useState<WishSortKey>("priority");

  const sorted = useMemo(() => {
    return [...wishes].sort((a, b) => {
      if (sortKey === "pref") {
        const pa = PREF_ORDER.indexOf(a.pref); const pb = PREF_ORDER.indexOf(b.pref);
        const va = pa === -1 ? 999 : pa; const vb = pb === -1 ? 999 : pb;
        if (va !== vb) return va - vb;
        return jaSort(a.name, b.name);
      } else {
        const pa = PRIORITY_ORDER[a.priority as WishPriority] ?? 1;
        const pb = PRIORITY_ORDER[b.priority as WishPriority] ?? 1;
        if (pa !== pb) return pa - pb;
        return jaSort(a.pref || "", b.pref || "");
      }
    });
  }, [wishes, sortKey]);

  if (wishes.length === 0) return (
    <div className="flex flex-col items-center justify-center py-32 text-stone-300">
      <Heart size={48} className="mb-4" />
      <p className="font-black text-sm">行きたい場所を追加しましょう</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-28">
      {/* ソートボタン */}
      <div className="flex gap-2 mb-5">
        {([["priority","優先度順"],["pref","都道府県順"]] as [WishSortKey,string][]).map(([key, label]) => (
          <button key={key} onClick={() => setSortKey(key)}
            className={`px-4 py-1.5 rounded-full text-[11px] font-black border transition-all ${
              sortKey === key
                ? "bg-[#B7410E] text-white border-[#B7410E] shadow"
                : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
            }`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((w) => (
          <div key={w.id} className="bg-white border border-stone-200 rounded-[24px] p-5 shadow-sm hover:shadow-lg transition-all group">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex flex-wrap gap-1.5">
                {w.pref && (
                  <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    {w.pref}
                  </span>
                )}
                {w.wishType && (
                  <span className="text-[10px] font-black text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
                    {w.wishType === "battlefield" ? "古戦場" : "城"}
                  </span>
                )}
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${PRIORITY_STYLE[w.priority as WishPriority] || PRIORITY_STYLE["中"]}`}>
                  {w.priority || "中"}
                </span>
              </div>
            </div>
            <h3 className="text-lg font-black text-stone-900 leading-tight mb-1 flex items-center gap-1.5">
              <span className="truncate">{w.name}</span>
              <a href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(w.name)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-stone-200 hover:text-stone-600 transition-colors shrink-0">
                <ExternalLink size={13} />
              </a>
            </h3>
            {w.address && (
              <div className="flex items-start gap-1.5 mt-1 mb-1">
                <MapPin size={11} className="text-stone-300 mt-0.5 shrink-0" />
                <span className="text-[11px] text-stone-500 line-clamp-1">{w.address}</span>
              </div>
            )}
            {w.memo && (
              <p className="text-[11px] text-stone-500 italic bg-stone-50 rounded-xl px-3 py-2 mt-2 line-clamp-2 border border-stone-100">
                {w.memo}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => onVisited(w)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[11px] font-black hover:bg-amber-100 transition-all">
                <CheckCircle size={13} /> 訪問済みへ
              </button>
              <button onClick={() => onEdit(w)}
                className="p-2 bg-stone-50 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-all">
                <Edit3 size={14} />
              </button>
              <button onClick={() => onDelete(w.id, w.name)}
                className="p-2 bg-stone-50 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── メインアプリ ──────────────────────────────────────

export default function App() {
  const [castles, setCastles] = useState<any[]>([]);
  const [wishes, setWishes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isWishFormOpen, setIsWishFormOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageType>("list");
  const [recordTab, setRecordTab] = useState<RecordType>("castle");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "visitDate", direction: "desc" });
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    name: "", aka: "", pref: "", province: "", address: "",
    visitDate: "", battleYear: "", rating: 5, memo: "", photo: "",
    recordType: "castle" as RecordType,
    lat: null as number | null, lng: null as number | null,
    manualCoord: false as boolean
  };
  // ③ 行きたいリストに住所追加
  const emptyWishForm = {
    name: "", pref: "", province: "", address: "", memo: "",
    priority: "中" as WishPriority, wishType: "castle" as RecordType
  };
  const [formData, setFormData] = useState<typeof emptyForm>(emptyForm);
  const [wishFormData, setWishFormData] = useState<typeof emptyWishForm>(emptyWishForm);
  const [editingWishId, setEditingWishId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [focusCastleId, setFocusCastleId] = useState<string | null>(null);

  // ─── Firestore 読み込み（④ キャッシュ優先：初回もキャッシュから即表示） ──
  useEffect(() => {
    setLoading(true);
    const qCol = collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles");
    const unsub = onSnapshot(qCol,
      { includeMetadataChanges: false },
      (snap) => {
        setCastles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false); // キャッシュからでもサーバーからでも即座に非表示
      },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const qCol = collection(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes");
    const unsub = onSnapshot(qCol,
      (snap) => setWishes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error(err)
    );
    return () => unsub();
  }, []);

  // ─── 検索 & ソート ────────────────────────────────────
  const processedData = useMemo(() => {
    let result = castles.filter((c) => {
      const matchType = (c.recordType || "castle") === recordTab;
      const matchSearch = (c.name+(c.aka||"")+(c.pref||"")+(c.province||"")+(c.address||"")+(c.memo||""))
        .toLowerCase().includes(searchTerm.toLowerCase());
      return matchType && matchSearch;
    });

    result.sort((a, b) => {
      let valA: any, valB: any;
      const dir = sortConfig.direction === "asc" ? 1 : -1;

      if (sortConfig.key === "pref") {
        // 都道府県はコード順（PREF_ORDER）、同一都道府県内は五十音順
        let pa = PREF_ORDER.indexOf(a.pref); if (pa === -1) pa = 999;
        let pb = PREF_ORDER.indexOf(b.pref); if (pb === -1) pb = 999;
        if (pa !== pb) return (pa - pb) * dir;
        return jaSort(a.name || "", b.name || "");
      } else if (sortConfig.key === "visitDate") {
        const toDate = (v: any) => { if (!v) return 0; if (v.toDate) return v.toDate().getTime(); return new Date(v).getTime(); };
        valA = toDate(a.visitDate); valB = toDate(b.visitDate);
      } else if (sortConfig.key === "rating") {
        valA = a.rating || 0; valB = b.rating || 0;
        if (valA !== valB) return (valA < valB ? -1 : 1) * dir;
        // ① 評価が同じ場合は五十音順
        return jaSort(a.name || "", b.name || "");
      } else if (sortConfig.key === "battleYear") {
        // ② 年順
        valA = parseInt(a.battleYear || "0"); valB = parseInt(b.battleYear || "0");
      } else {
        valA = (a[sortConfig.key]||"").toString(); valB = (b[sortConfig.key]||"").toString();
      }
      if (valA < valB) return -1 * dir;
      if (valA > valB) return 1 * dir;
      return 0;
    });
    return result;
  }, [castles, searchTerm, sortConfig, recordTab]);

  // ─── 写真選択 ─────────────────────────────────────────
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoError(""); setPhotoLoading(true);
    try {
      const result = await processPhoto(file);
      if (result.error) { setPhotoError(result.error); setPhotoPreview(""); setFormData((f) => ({ ...f, photo: "" })); }
      else { setPhotoPreview(result.data); setFormData((f) => ({ ...f, photo: result.data })); }
    } catch { setPhotoError("画像の処理に失敗しました。"); }
    finally { setPhotoLoading(false); if (photoInputRef.current) photoInputRef.current.value = ""; }
  };

  // ─── 住所から都道府県を自動取得 ─────────────────────────
  useEffect(() => {
    if (!formData.address || formData.address.length < 4) return;
    const timer = setTimeout(async () => {
      const google = (window as any).google;
      if (!google?.maps) return;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: formData.address, region: "jp" }, (results: any, status: any) => {
        if (status !== "OK" || !results?.[0]) return;
        // 都道府県コンポーネントを探す
        const prefComp = results[0].address_components?.find((c: any) =>
          c.types.includes("administrative_area_level_1")
        );
        if (prefComp) {
          const prefName = prefComp.long_name;
          setFormData(f => ({ ...f, pref: prefName }));
        }
      });
    }, 800); // 800ms debounce
    return () => clearTimeout(timer);
  }, [formData.address]);

  // ─── 訪問記録 保存 ────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); if (!formData.name || isSaving) return;
    setIsSaving(true);
    try {
      const ref = editingId
        ? doc(db, "artifacts", appId, "users", FIXED_USER_ID, "castles", editingId)
        : doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));

      // 手動修正済みの座標は上書きしない
      const isManual = formData.manualCoord === true;
      const needsGeocode = !isManual;

      let lat = formData.lat;
      let lng = formData.lng;

      if (needsGeocode) {
        const google = (window as any).google;
        if (!google?.maps?.Geocoder) {
          lat = null; lng = null;
        } else {
          try {
            // 15秒で強制終了するタイムアウトを設定
            const coordsPromise = resolveCoords(formData.name, formData.address, formData.pref);
            const timeoutPromise = new Promise<null>(res => setTimeout(() => res(null), 15000));
            const coords = await Promise.race([coordsPromise, timeoutPromise]);
            if (coords) { lat = coords.lat; lng = coords.lng; }
            else { lat = null; lng = null; }
          } catch { lat = null; lng = null; }
        }
      }

      await setDoc(ref, {
        ...formData,
        lat, lng,
        visitDate: (formData.visitDate||"").replace(/\//g, "-"),
        updatedAt: new Date().toISOString()
      });
      setIsFormOpen(false); setEditingId(null); setFormData(emptyForm); setPhotoPreview(""); setPhotoError("");
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  // ─── ウィッシュリスト 保存 ────────────────────────────
  const handleWishSave = async (e: React.FormEvent) => {
    e.preventDefault(); if (!wishFormData.name || isSaving) return;
    setIsSaving(true);
    try {
      const ref = editingWishId
        ? doc(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes", editingWishId)
        : doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes"));
      await setDoc(ref, { ...wishFormData, updatedAt: new Date().toISOString() });
      setIsWishFormOpen(false); setEditingWishId(null); setWishFormData(emptyWishForm);
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  // ─── ウィッシュ → 訪問済みへ移動 ─────────────────────
  const handleMoveToVisited = async (w: any) => {
    const type: RecordType = w.wishType || "castle";
    if (!window.confirm(`「${w.name}」を訪問済みに移動しますか？`)) return;
    try {
      const ref = doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
      await setDoc(ref, {
        name: w.name, pref: w.pref||"", province: w.province||"",
        address: w.address||"", aka: "", visitDate: "", battleYear: "",
        rating: 5, memo: w.memo||"", photo: "", recordType: type, updatedAt: new Date().toISOString(),
      });
      await deleteDoc(doc(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes", w.id));
      setCurrentPage("list"); setRecordTab(type);
    } catch (err) { console.error(err); }
  };

  // ─── フォームを開く ───────────────────────────────────
  // 日付を YYYY-MM-DD に正規化（スラッシュ区切りや不完全な形式に対応）
  const normalizeDate = (v: any): string => {
    if (!v) return "";
    if (typeof v === "object" && v.toDate) v = v.toDate().toISOString().split("T")[0];
    const s = String(v).trim();
    // YYYY/MM/DD → YYYY-MM-DD
    const slashMatch = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (slashMatch) return `${slashMatch[1]}-${slashMatch[2].padStart(2,"0")}-${slashMatch[3].padStart(2,"0")}`;
    // YYYY-MM-DD はそのまま
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // その他はinput type=dateが認識できないので空欄に
    return "";
  };

  const openForm = (castle?: any) => {
    if (castle) {
      setFormData({
        ...emptyForm, ...castle,
        visitDate: normalizeDate(castle.visitDate),
        lat: castle.lat ?? null,
        lng: castle.lng ?? null,
      });
      setPhotoPreview(castle.photo || "");
      setEditingId(castle.id);
    } else {
      setFormData({ ...emptyForm, recordType: recordTab });
      setPhotoPreview(""); setEditingId(null);
    }
    setPhotoError(""); setIsFormOpen(true);
  };

  const openWishForm = (w?: any) => {
    if (w) {
      setWishFormData({
        name: w.name, pref: w.pref||"", province: w.province||"",
        address: w.address||"", memo: w.memo||"",
        priority: w.priority||"中", wishType: w.wishType||"castle"
      });
      setEditingWishId(w.id);
    } else {
      setWishFormData(emptyWishForm); setEditingWishId(null);
    }
    setIsWishFormOpen(true);
  };

  // ─── CSV インポート ───────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buf = ev.target!.result as ArrayBuffer;
        let text = new TextDecoder("shift-jis").decode(buf);
        if (!text.includes("城名")) text = new TextDecoder("utf-8").decode(buf);
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) throw new Error("データが足りません");
        const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const fc = (keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
        const col = { pref: fc(["都道府県"]), name: fc(["城名"]), aka: fc(["別名"]), prov: fc(["旧国"]), addr: fc(["住所"]), date: fc(["訪問日"]), memo: fc(["メモ"]) };
        if (col.name === -1) throw new Error("「城名」の列が見つかりません");
        const batch = writeBatch(db); let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, ""));
          const name = cols[col.name]; if (!name) continue;
          const ref = doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
          batch.set(ref, {
            name, pref: col.pref !== -1 ? cols[col.pref] : "", aka: col.aka !== -1 ? cols[col.aka] : "",
            province: col.prov !== -1 ? cols[col.prov] : "", address: col.addr !== -1 ? cols[col.addr] : "",
            visitDate: col.date !== -1 ? cols[col.date].replace(/\//g, "-") : "",
            battleYear: "", rating: 5, memo: col.memo !== -1 ? cols[col.memo] : "",
            photo: "", recordType: "castle", updatedAt: new Date().toISOString(),
          });
          count++; if (count >= 450) break;
        }
        await batch.commit(); alert(`${count} 件をインポートしました！`); setShowSettings(false);
      } catch (err: any) { alert(`エラー: ${err.message}`); }
      finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleSort = (key: string) =>
    setSortConfig((p) => ({ key, direction: p.key === key && p.direction === "desc" ? "asc" : "desc" }));

  const tabLabel = recordTab === "castle" ? "城" : "古戦場";

  // ─── レンダリング ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-stone-800 font-sans flex flex-col">

      {/* ── ヘッダー ── */}
      <header className="bg-white/95 border-b border-stone-200 sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CastleIcon />
            <h1 className="text-xl font-black tracking-tighter text-stone-900">攻城記録</h1>
            <div className="flex flex-col gap-0.5">
              <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[11px] font-black border border-amber-200 leading-tight">
                🏯 {castles.filter(c => (c.recordType || "castle") === "castle").length} 城
              </span>
              <span className="bg-stone-50 text-stone-500 px-2 py-0.5 rounded text-[11px] font-black border border-stone-200 leading-tight">
                ⚔️ {castles.filter(c => c.recordType === "battlefield").length} 古戦場
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {currentPage === "list" && (
              <>
                <button onClick={() => setShowSettings(true)} className="p-2 text-stone-400 hover:text-stone-800 transition-colors">
                  <Settings size={22} />
                </button>
                <button onClick={() => openForm()}
                  className="bg-[#B7410E] text-white px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1 shadow-md active:scale-95 transition-all hover:bg-[#9a3509]">
                  <Plus size={18} /> 追加
                </button>
              </>
            )}
            {currentPage === "wishlist" && (
              <button onClick={() => openWishForm()}
                className="bg-[#B7410E] text-white px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1 shadow-md active:scale-95 transition-all hover:bg-[#9a3509]">
                <Plus size={18} /> 追加
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── 訪問記録：検索バー固定エリア ── */}
      {currentPage === "list" && (
        <div className="bg-[#FDFCFB] border-b border-stone-100 sticky top-[73px] z-40 px-4 pt-3 pb-2 md:px-6">
          <div className="max-w-5xl mx-auto space-y-2">
            {/* 城 / 古戦場 タブ */}
            <div className="flex gap-2">
              {(["castle", "battlefield"] as RecordType[]).map((type) => (
                <button key={type} onClick={() => { setRecordTab(type); setSearchTerm(""); setSortConfig({ key: "visitDate", direction: "desc" }); }}
                  className={`px-5 py-1.5 rounded-full text-[11px] font-black border transition-all ${
                    recordTab === type
                      ? "bg-stone-800 text-white border-stone-800"
                      : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                  }`}>
                  {type === "castle" ? "🏯 城" : "⚔️ 古戦場"}
                </button>
              ))}
            </div>
            {/* 検索バー */}
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-stone-600 transition-colors" size={18} />
              <input ref={searchInputRef} type="text"
                placeholder={`${tabLabel}名、県名、旧国、住所、メモで検索...`}
                className="w-full py-3 pl-11 pr-10 bg-white border border-stone-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-amber-400/10 focus:border-amber-300 shadow-sm transition-all"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              {searchTerm && (
                <button onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition-colors">
                  <X size={16} />
                </button>
              )}
            </div>
            {/* ソートボタン */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(recordTab === "castle"
                ? [{ label: "訪問日順", key: "visitDate" }, { label: "都道府県順", key: "pref" }, { label: "評価順", key: "rating" }]
                : [{ label: "訪問日順", key: "visitDate" }, { label: "都道府県順", key: "pref" }, { label: "評価順", key: "rating" }, { label: "年順", key: "battleYear" }]
              ).map((item) => (
                <button key={item.key} onClick={() => toggleSort(item.key)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black border whitespace-nowrap transition-all ${
                    sortConfig.key === item.key
                      ? "bg-[#B7410E] text-white border-[#B7410E] shadow"
                      : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                  }`}>
                  {item.label}
                  {sortConfig.key === item.key && (sortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── メインコンテンツ ── */}
      <main className={`flex-1 overflow-y-auto ${currentPage === "map" ? "" : "max-w-5xl mx-auto w-full p-4 md:p-6"}`}>

        {/* ══ 訪問記録ページ ══ */}
        {currentPage === "list" && (
          <>
            {loading ? (
              <div className="flex flex-col items-center py-32 text-stone-300 animate-pulse">
                <Loader2 className="animate-spin mb-4" size={40} />
                <span className="text-xs font-black uppercase tracking-widest">Loading Records...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-28">
                {searchTerm && (
                  <div className="col-span-full text-[11px] text-stone-400 font-bold">
                    {processedData.length} 件見つかりました
                  </div>
                )}
                {processedData.map((castle) => (
                  <div key={castle.id}
                    id={`castle-card-${castle.id}`}
                    className={`bg-white border rounded-[28px] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group ${
                      highlightId === castle.id
                        ? "border-[#B7410E] ring-2 ring-[#B7410E]/30"
                        : "border-stone-200"
                    }`}
                    onAnimationEnd={() => { if (highlightId === castle.id) setHighlightId(null); }}
                  >
                    <div className="flex gap-3 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                            {castle.pref || "未設定"}
                          </span>
                          {castle.province && (
                            <span className="text-[10px] font-black text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
                              {castle.province}
                            </span>
                          )}
                        </div>
                        <div className="mb-1"><Stars rating={castle.rating || 5} size={12} /></div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-lg font-black text-stone-900 leading-tight truncate">{castle.name}</h3>
                          <a href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(castle.name)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-stone-200 hover:text-stone-600 transition-colors shrink-0">
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>
                      <div className="shrink-0 w-20 h-20">
                        {castle.photo ? (
                          <button onClick={() => setZoomedPhoto(castle.photo)}
                            className="w-full h-full rounded-lg overflow-hidden border border-stone-200 shadow-sm hover:shadow-md hover:scale-105 transition-all">
                            <img src={castle.photo} alt={castle.name} className="w-full h-full object-cover" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <p className="text-[11px] text-stone-400 font-medium mb-3 truncate h-[16px]">
                      {castle.aka ? `別名: ${castle.aka}` : ""}
                    </p>

                    <div className="space-y-1.5 text-[12px] text-stone-500">
                      <div className="flex items-center gap-2 font-bold text-stone-700 h-[18px]">
                        <Calendar size={12} className="text-amber-400 shrink-0" />
                        <span>
                          {castle.recordType === "battlefield" && castle.battleYear
                            ? `${castle.battleYear}年${castle.visitDate ? ` / 訪問: ${castle.visitDate}` : ""}`
                            : castle.visitDate || ""}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 h-[18px]">
                        <MapPin size={12} className="text-stone-300 mt-0.5 shrink-0" />
                        <span className="line-clamp-1">{castle.address || ""}</span>
                      </div>
                      <div className="h-[44px] mt-1">
                        {castle.memo ? (
                          <div className="p-2.5 bg-amber-50/60 rounded-xl text-stone-600 line-clamp-2 italic text-[11px] border border-amber-100 h-full">
                            {castle.memo}
                          </div>
                        ) : <div className="h-full" />}
                      </div>
                    </div>

                    <div className="flex justify-end gap-1 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setFocusCastleId(castle.id); setCurrentPage("map"); }}
                        className="p-1.5 bg-stone-50 text-stone-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-all"
                        title="マップで表示">
                        <Map size={14} />
                      </button>
                      <button onClick={() => openForm(castle)}
                        className="p-1.5 bg-stone-50 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-all">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={async () => {
                        if (window.confirm(`${castle.name}の記録を削除しますか？`))
                          await deleteDoc(doc(db, "artifacts", appId, "users", FIXED_USER_ID, "castles", castle.id));
                      }} className="p-1.5 bg-stone-50 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {currentPage === "prefecture" && <PrefecturePage castles={castles} />}
        {currentPage === "stats" && <StatsPage castles={castles} />}
        {/* マップは常時レンダリング・display:noneを使わない（サイズ0になりグレーになるため） */}
        <div style={{
          position: currentPage === "map" ? "relative" : "fixed",
          visibility: currentPage === "map" ? "visible" : "hidden",
          pointerEvents: currentPage === "map" ? "auto" : "none",
          width: "100%", height: currentPage === "map" ? "auto" : "100vh",
          top: currentPage === "map" ? "auto" : "-9999px",
        }}>
          <MapPage castles={castles} wishes={wishes} onCastleSelect={(castle) => {
            setCurrentPage("list");
            setRecordTab(castle.recordType || "castle");
            setSearchTerm("");
            setHighlightId(castle.id);
            setTimeout(() => {
              const el = document.getElementById(`castle-card-${castle.id}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
          }} focusCastleId={focusCastleId} onFocusHandled={() => setFocusCastleId(null)}
          isVisible={currentPage === "map"} />

        </div>
        {currentPage === "wishlist" && (
          <WishlistPage
            wishes={wishes}
            onEdit={openWishForm}
            onDelete={async (id, name) => {
              if (window.confirm(`「${name}」をリストから削除しますか？`))
                await deleteDoc(doc(db, "artifacts", appId, "users", FIXED_USER_ID, "wishes", id));
            }}
            onVisited={handleMoveToVisited}
          />
        )}
      </main>

      {/* ── ボトムナビゲーション ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-stone-200 z-[2000] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex">
          {[
            { page: "list" as PageType, label: "訪問記録", Icon: LayoutList },
            { page: "prefecture" as PageType, label: "都道府県", Icon: Flag },
            { page: "map" as PageType, label: "マップ", Icon: Map },
            { page: "stats" as PageType, label: "統計", Icon: BarChart2 },
            { page: "wishlist" as PageType, label: "行きたい", Icon: Heart },
          ].map(({ page, label, Icon }) => (
            <button key={page} onClick={() => setCurrentPage(page)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[10px] font-black transition-colors relative ${
                currentPage === page ? "text-[#B7410E]" : "text-stone-400 hover:text-stone-600"
              }`}>
              <Icon size={20} />
              {label}
              {page === "wishlist" && wishes.length > 0 && (
                <span className="absolute top-2 right-[calc(50%-14px)] bg-[#B7410E] text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {wishes.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── 写真拡大モーダル ── */}
      {zoomedPhoto && (
        <div className="fixed inset-0 bg-stone-900/80 z-[3000] flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setZoomedPhoto(null)}>
          <div className="relative max-w-lg w-full">
            <img src={zoomedPhoto} alt="写真" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
            <button onClick={() => setZoomedPhoto(null)}
              className="absolute top-3 right-3 bg-white/90 rounded-full p-1.5 text-stone-600 hover:text-stone-900 shadow">
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── 設定モーダル ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-stone-900/40 z-[110] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[48px] shadow-2xl p-12 text-center">
            <h2 className="text-2xl font-black mb-10 text-stone-900">データ管理</h2>
            <div className="space-y-4">
              <button disabled={isImporting} onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm"><FileUp size={20} className="text-stone-800" /></div>
                  <div className="text-left">
                    <p className="text-stone-900">CSVを読み込む</p>
                    <p className="text-[10px] text-stone-400 font-normal">230_castles.csv 対応</p>
                  </div>
                </div>
                {isImporting ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={16} className="text-stone-300" />}
              </button>
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button onClick={() => {
                const header = "都道府県,城名,別名,旧国,住所,訪問日,合戦年,評価,メモ,種別\n";
                const rows = castles.map((c) =>
                  `"${c.pref||""}","${c.name}","${c.aka||""}","${c.province||""}","${c.address||""}","${c.visitDate||""}","${c.battleYear||""}",${c.rating},"${c.memo||""}","${c.recordType||"castle"}"`
                ).join("\n");
                const blob = new Blob([new Uint8Array([0xef,0xbb,0xbf]), header+rows], { type: "text/csv;charset=utf-8;" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                a.download = `城郭記録_${new Date().toISOString().split("T")[0]}.csv`; a.click();
              }} className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm"><Download size={20} className="text-stone-800" /></div>
                  <div className="text-left">
                    <p className="text-stone-900">バックアップ保存</p>
                    <p className="text-[10px] text-stone-400 font-normal">現在のデータをCSV出力</p>
                  </div>
                </div>
                <ArrowDown size={16} className="text-stone-300" />
              </button>
              {/* 既存データ一括座標付与 */}
              <button onClick={async () => {
                const google = (window as any).google;
                if (!google?.maps) { alert("マップページを一度開いてから実行してください"); return; }
                // 診断：全件のlat/lng状況を確認
                const noCoord = castles.filter(c => !c.lat && !c.lng);
                const hasCoord = castles.filter(c => c.lat && c.lng);
                const manual = castles.filter(c => c.manualCoord);
                const targets = castles.filter(c => !c.manualCoord && (!c.lat || !c.lng));
                const diagMsg = `全${castles.length}件\n座標あり: ${hasCoord.length}件\n座標なし: ${noCoord.length}件\n手動設定: ${manual.length}件\n付与対象: ${targets.length}件\n\n続けますか？`;
                if (!window.confirm(diagMsg)) return;
                if (targets.length === 0) { alert("座標未設定のデータはありません"); return; }
                if (!window.confirm(`座標が未設定の ${targets.length} 件にGoogle座標を付与します。\n時間がかかる場合があります。実行しますか？`)) return;
                setShowSettings(false);
                const geocoder = new google.maps.Geocoder();
                const geocodeOne = (query: string, pref: string): Promise<{lat:number,lng:number}|null> =>
                  new Promise(resolve => {
                    geocoder.geocode({ address: query, region: "jp" }, (results: any, status: any) => {
                      if (status === "OK" && results?.[0]) {
                        const loc = results[0].geometry.location;
                        const lat = loc.lat(), lng = loc.lng();
                        if (isInJapan(lat, lng) && (!pref || isInPref(lat, lng, pref))) {
                          resolve({ lat, lng });
                        } else { resolve(null); }
                      } else { resolve(null); }
                    });
                  });
                // まず1件テスト
                const testCastle = targets[0];
                const testQuery = (testCastle.pref && testCastle.address && !testCastle.address.startsWith(testCastle.pref))
                  ? testCastle.pref + testCastle.address : (testCastle.address || testCastle.pref + " " + testCastle.name);
                const testResult = await geocodeOne(testQuery, testCastle.pref || "");
                if (!testResult) {
                  alert(`APIテスト失敗\n城名: ${testCastle.name}\nクエリ: ${testQuery}\n\nGoogle Maps APIキーのGeocoding APIが有効か確認してください。\nGoogle Cloud Console → APIとサービス → 認証情報 → APIキーの制限を確認してください。`);
                  return;
                }
                // wishesも対象に含める
                const wishTargets = wishes.filter((w: any) => !w.lat || !w.lng);
                const allTargets = [
                  ...targets.map((t: any) => ({ ...t, _col: "castles" })),
                  ...wishTargets.map((w: any) => ({ ...w, _col: "wishes" })),
                ];
                let success = 0, fail = 0;
                for (const item of allTargets) {
                  const addr = item.address || "";
                  const pref = item.pref || "";
                  const name = item.name || "";
                  let coords: {lat:number,lng:number}|null = null;
                  if (addr) coords = await geocodeOne(pref && !addr.startsWith(pref) ? pref+addr : addr, pref);
                  if (!coords && pref) coords = await geocodeOne(`${pref} ${name}`, pref);
                  if (!coords) coords = await geocodeOne(name, pref);
                  const { _col, ...saveItem } = item;
                  const ref = doc(db, "artifacts", appId, "users", FIXED_USER_ID, _col, item.id);
                  if (coords) {
                    await setDoc(ref, { ...saveItem, lat: coords.lat, lng: coords.lng, updatedAt: new Date().toISOString() });
                    success++;
                  } else { fail++; }
                  await new Promise(r => setTimeout(r, 300));
                }
                alert(`座標付与完了\n成功: ${success} 件 / 失敗: ${fail} 件\n（訪問済み${targets.length}件 + 行きたい${wishTargets.length}件が対象）`);
              }} className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm"><MapPin size={20} className="text-stone-800" /></div>
                  <div className="text-left">
                    <p className="text-stone-900">座標を一括付与</p>
                    <p className="text-[10px] text-stone-400 font-normal">未設定データにGoogle座標を付与</p>
                  </div>
                </div>
                <ArrowUp size={16} className="text-stone-300" />
              </button>
            </div>
            <button onClick={() => setShowSettings(false)}
              className="mt-12 text-stone-300 font-black text-[10px] uppercase tracking-widest hover:text-stone-800 transition-colors">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ── 訪問記録フォームモーダル ── */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-stone-900/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-t-[40px] md:rounded-[40px] shadow-2xl flex flex-col max-h-[94vh]">
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-stone-900">{editingId ? "記録を編集" : "新しい記録を登録"}</h2>
              <button type="button" onClick={() => setIsFormOpen(false)}
                className="p-2 text-stone-300 hover:text-stone-800 bg-stone-50 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto" style={{ paddingBottom: "80px" }}>
              <form onSubmit={handleSave} className="space-y-5">

                {/* 種別 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">種別</label>
                  <div className="flex gap-2">
                    {([["castle","🏯 城"],["battlefield","⚔️ 古戦場"]] as [RecordType,string][]).map(([type, label]) => (
                      <button key={type} type="button" onClick={() => setFormData((f) => ({ ...f, recordType: type }))}
                        className={`flex-1 py-2.5 rounded-[14px] text-[11px] font-black border transition-all ${
                          formData.recordType === type
                            ? "bg-stone-800 text-white border-stone-800"
                            : "bg-stone-50 text-stone-500 border-stone-200"
                        }`}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="f-name" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                    {formData.recordType === "castle" ? "城郭名" : "古戦場名"}
                  </label>
                  <input id="f-name" name="name" required
                    placeholder={formData.recordType === "castle" ? "例: 姫路城" : "例: 関ヶ原"}
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent font-black text-stone-900 outline-none focus:bg-white focus:border-stone-200 transition-colors"
                    value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="f-aka" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">別名</label>
                    <input id="f-aka" name="aka" placeholder="例: 白鷺城"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.aka} onChange={(e) => setFormData({ ...formData, aka: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="f-province" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">旧国名</label>
                    <input id="f-province" name="province" placeholder="例: 播磨"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="f-date" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">訪問日</label>
                    <input id="f-date" name="visitDate" type="date"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.visitDate} onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })} />
                </div>

                {/* ② 古戦場のみ「年」フィールドを表示 */}
                {formData.recordType === "battlefield" && (
                  <div className="space-y-1.5">
                    <label htmlFor="f-battleYear" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">合戦年（西暦）</label>
                    <input id="f-battleYear" name="battleYear" type="number"
                      placeholder="例: 1600"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.battleYear} onChange={(e) => setFormData({ ...formData, battleYear: e.target.value })} />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="f-address" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">所在地</label>
                  <input id="f-address" name="address" placeholder="住所を入力（都道府県は自動取得されます）"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                    value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                  {formData.pref && (
                    <p className="text-[10px] text-stone-400 ml-1 flex items-center gap-1">
                      <span className="text-green-500">✓</span> 都道府県: <span className="font-black text-stone-600">{formData.pref}</span>
                      <button type="button" onClick={() => setFormData(f => ({...f, pref: ""}))}
                        className="ml-1 text-stone-300 hover:text-stone-500">✕</button>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="f-memo" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">メモ・備考</label>
                  <textarea id="f-memo" name="memo" placeholder="感想やアクセスの注意点など…" rows={3}
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors resize-none"
                    value={formData.memo} onChange={(e) => setFormData({ ...formData, memo: e.target.value })} />
                </div>

                {/* 写真 */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">写真</label>
                  <div className="flex items-start gap-3">
                    <div className="w-20 h-20 rounded-lg border border-stone-200 overflow-hidden bg-stone-50 flex items-center justify-center shrink-0">
                      {photoLoading ? <Loader2 size={20} className="animate-spin text-stone-300" />
                        : photoPreview ? <img src={photoPreview} alt="プレビュー" className="w-full h-full object-cover" />
                        : <Camera size={24} className="text-stone-300" />}
                    </div>
                    <div className="flex-1 space-y-2">
                      <button type="button" onClick={() => photoInputRef.current?.click()}
                        className="w-full py-2.5 px-4 bg-stone-50 border border-stone-200 rounded-[14px] text-[11px] font-black text-stone-600 hover:bg-stone-100 transition-colors flex items-center justify-center gap-2">
                        <Camera size={14} />{photoPreview ? "写真を変更" : "写真を選択"}
                      </button>
                      {photoPreview && (
                        <button type="button" onClick={() => { setPhotoPreview(""); setFormData((f) => ({ ...f, photo: "" })); setPhotoError(""); }}
                          className="w-full py-2 px-4 bg-rose-50 border border-rose-100 rounded-[14px] text-[11px] font-black text-rose-400 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2">
                          <XCircle size={13} /> 写真を削除
                        </button>
                      )}
                      <p className="text-[10px] text-stone-400 ml-1">自動圧縮・上限 50KB</p>
                      {photoError && <p className="text-[10px] text-rose-500 bg-rose-50 rounded-lg px-2 py-1.5 border border-rose-100">{photoError}</p>}
                    </div>
                  </div>
                  <input type="file" accept="image/*" ref={photoInputRef} onChange={handlePhotoSelect} className="hidden" />
                </div>

                {/* 満足度 */}
                <div className="space-y-1.5 text-center">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">満足度</label>
                  <div className="flex justify-center gap-2">
                    {[1,2,3,4,5].map((n) => (
                      <button key={n} type="button" onClick={() => setFormData({ ...formData, rating: n })}
                        className={`text-3xl transition-transform active:scale-90 ${formData.rating >= n ? "text-amber-400" : "text-stone-200"}`}>★</button>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={isSaving}
                  className="w-full bg-[#B7410E] text-white py-4 rounded-[24px] font-black shadow-xl hover:bg-[#9a3509] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  {isSaving ? "座標を取得中..." : "記録を保存"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── ウィッシュリストフォームモーダル ── */}
      {isWishFormOpen && (
        <div className="fixed inset-0 bg-stone-900/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-t-[40px] md:rounded-[40px] shadow-2xl flex flex-col max-h-[94vh]">
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-stone-900">{editingWishId ? "リストを編集" : "行きたい場所を追加"}</h2>
              <button type="button" onClick={() => setIsWishFormOpen(false)}
                className="p-2 text-stone-300 hover:text-stone-800 bg-stone-50 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto" style={{ paddingBottom: "80px" }}>
              <form onSubmit={handleWishSave} className="space-y-5">

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">種別</label>
                  <div className="flex gap-2">
                    {([["castle","🏯 城"],["battlefield","⚔️ 古戦場"]] as [RecordType,string][]).map(([type, label]) => (
                      <button key={type} type="button" onClick={() => setWishFormData((f) => ({ ...f, wishType: type }))}
                        className={`flex-1 py-2.5 rounded-[14px] text-[11px] font-black border transition-all ${
                          wishFormData.wishType === type
                            ? "bg-stone-800 text-white border-stone-800"
                            : "bg-stone-50 text-stone-500 border-stone-200"
                        }`}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="w-name" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">名称</label>
                  <input id="w-name" name="name" required placeholder="例: 松本城"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent font-black text-stone-900 outline-none focus:bg-white focus:border-stone-200 transition-colors"
                    value={wishFormData.name} onChange={(e) => setWishFormData({ ...wishFormData, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="w-pref" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">都道府県</label>
                    <input id="w-pref" name="pref" placeholder="例: 長野県"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={wishFormData.pref} onChange={(e) => setWishFormData({ ...wishFormData, pref: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="w-province" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">旧国名</label>
                    <input id="w-province" name="province" placeholder="例: 信濃"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={wishFormData.province} onChange={(e) => setWishFormData({ ...wishFormData, province: e.target.value })} />
                  </div>
                </div>

                {/* ③ 住所追加 */}
                <div className="space-y-1.5">
                  <label htmlFor="w-address" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">住所</label>
                  <input id="w-address" name="address" placeholder="例: 長野県松本市丸の内4-1"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                    value={wishFormData.address} onChange={(e) => setWishFormData({ ...wishFormData, address: e.target.value })} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">優先度</label>
                  <div className="flex gap-2">
                    {(["高","中","低"] as WishPriority[]).map((p) => (
                      <button key={p} type="button" onClick={() => setWishFormData((f) => ({ ...f, priority: p }))}
                        className={`flex-1 py-2.5 rounded-[14px] text-[11px] font-black border transition-all ${
                          wishFormData.priority === p ? `${PRIORITY_STYLE[p]} shadow` : "bg-stone-50 text-stone-400 border-stone-200"
                        }`}>{p}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="w-memo" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">メモ</label>
                  <textarea id="w-memo" name="memo" placeholder="行きたい理由など…" rows={3}
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors resize-none"
                    value={wishFormData.memo} onChange={(e) => setWishFormData({ ...wishFormData, memo: e.target.value })} />
                </div>

                <button type="submit" disabled={isSaving}
                  className="w-full bg-[#B7410E] text-white py-4 rounded-[24px] font-black shadow-xl hover:bg-[#9a3509] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {isSaving && <Loader2 size={16} className="animate-spin" />}
                  リストに保存
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
