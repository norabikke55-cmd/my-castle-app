import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, onSnapshot, doc, deleteDoc, setDoc, writeBatch
} from 'firebase/firestore';
import {
  Search, Calendar, Trash2, Plus, Star, X, Settings,
  Edit3, MapPin, Download, FileUp, ExternalLink,
  Loader2, ArrowUp, ArrowDown, LayoutList, Flag, Map
} from 'lucide-react';
import { db, appId } from "./firebase";

// ─── 定数 ──────────────────────────────────────────────
const FIXED_USER_ID = "toshiyuki";

type PageType = "list" | "prefecture" | "map";

const PREF_ORDER = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
  "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県",
  "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

// 都道府県の中心座標（Leaflet マップ用）
const PREF_COORDS: Record<string, [number, number]> = {
  "北海道": [43.064, 141.347], "青森県": [40.824, 140.740], "岩手県": [39.703, 141.153],
  "宮城県": [38.269, 140.872], "秋田県": [39.719, 140.102], "山形県": [38.240, 140.363],
  "福島県": [37.750, 140.468], "茨城県": [36.342, 140.447], "栃木県": [36.566, 139.883],
  "群馬県": [36.391, 139.060], "埼玉県": [35.857, 139.649], "千葉県": [35.605, 140.123],
  "東京都": [35.690, 139.692], "神奈川県": [35.447, 139.642], "新潟県": [37.902, 139.023],
  "富山県": [36.695, 137.211], "石川県": [36.594, 136.626], "福井県": [36.065, 136.222],
  "山梨県": [35.664, 138.568], "長野県": [36.651, 138.181], "岐阜県": [35.391, 136.722],
  "静岡県": [34.977, 138.383], "愛知県": [35.180, 136.907], "三重県": [34.730, 136.509],
  "滋賀県": [35.004, 135.869], "京都府": [35.021, 135.756], "大阪府": [34.686, 135.520],
  "兵庫県": [34.691, 135.183], "奈良県": [34.685, 135.833], "和歌山県": [34.226, 135.168],
  "鳥取県": [35.504, 134.238], "島根県": [35.472, 133.051], "岡山県": [34.661, 133.935],
  "広島県": [34.396, 132.459], "山口県": [34.186, 131.471], "徳島県": [34.066, 134.559],
  "香川県": [34.340, 134.043], "愛媛県": [33.842, 132.766], "高知県": [33.560, 133.531],
  "福岡県": [33.607, 130.418], "佐賀県": [33.249, 130.299], "長崎県": [32.745, 129.874],
  "熊本県": [32.790, 130.742], "大分県": [33.239, 131.613], "宮崎県": [31.911, 131.424],
  "鹿児島県": [31.560, 130.558], "沖縄県": [26.212, 127.681],
};

// マーカー位置が重ならないよう城IDから決定論的オフセットを生成
const stableHash = (str: string): number => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
};

// ─── 共通コンポーネント ─────────────────────────────────

const CastleIcon = () => (
  <div className="relative w-12 h-12 flex items-center justify-center overflow-hidden">
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
      <Star
        key={n}
        size={size}
        className={n <= (rating || 5) ? "fill-amber-400 text-amber-400" : "fill-stone-200 text-stone-200"}
      />
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

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 pb-28">
      {/* サマリーバナー */}
      <div className="mb-6 p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-0.5">訪問都道府県</p>
          <p className="text-3xl font-black text-stone-900">
            {grouped.length}
            <span className="text-sm font-normal text-stone-400 ml-1">/ 47</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">合計</p>
          <p className="text-3xl font-black text-stone-900">
            {castles.length}
            <span className="text-sm font-normal text-stone-400 ml-1">城</span>
          </p>
        </div>
      </div>

      {/* 都道府県グループ */}
      <div className="space-y-3">
        {grouped.map(({ pref, items }) => (
          <div key={pref} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-stone-800">{pref}</h3>
              <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {items.length} 城
              </span>
            </div>
            <div className="divide-y divide-stone-50">
              {[...items]
                .sort((a, b) => (b.rating || 5) - (a.rating || 5))
                .map((castle) => (
                  <div key={castle.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-stone-800 truncate block">{castle.name}</span>
                      {castle.aka && (
                        <span className="text-[11px] text-stone-400">別名: {castle.aka}</span>
                      )}
                    </div>
                    <Stars rating={castle.rating || 5} size={11} />
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── マップページ（Leaflet） ─────────────────────────────

const MapPage = ({ castles }: { castles: any[] }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // マップ初期化（1回のみ）
  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const init = () => {
      const L = (window as any).L;
      if (!mapRef.current || mapInstanceRef.current || !L) return;

      const map = L.map(mapRef.current, { zoomControl: true }).setView([36.5, 137.5], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
      setMapReady(true);
    };

    if ((window as any).L) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = init;
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // マーカー更新（城データ変更時）
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = (window as any).L;

    // 既存マーカー削除
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // マーカーアイコン生成
    const makeIcon = (rating: number) => {
      const color = rating >= 5 ? "#B7410E" : rating >= 4 ? "#C06030" : rating >= 3 ? "#7c6a56" : "#9ca3af";
      return L.divIcon({
        html: `<div style="
          background:${color};color:white;width:30px;height:30px;
          border-radius:50%;display:flex;align-items:center;justify-content:center;
          font-size:15px;border:2px solid white;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);cursor:pointer;">🏯</div>`,
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -18],
      });
    };

    castles.forEach((castle) => {
      const coords = PREF_COORDS[castle.pref];
      if (!coords) return;

      const h = stableHash(castle.id || castle.name);
      const lat = coords[0] + (((h & 0xff) - 128) / 128) * 0.22;
      const lng = coords[1] + ((((h >> 8) & 0xff) - 128) / 128) * 0.22;

      const starsHtml = [1, 2, 3, 4, 5]
        .map((n) => `<span style="color:${n <= (castle.rating || 5) ? "#F59E0B" : "#e5e7eb"};font-size:13px">★</span>`)
        .join("");

      const marker = L.marker([lat, lng], { icon: makeIcon(castle.rating || 5) })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:140px;padding:2px">
            <div style="font-weight:900;font-size:14px;margin-bottom:3px;color:#1c1917">${castle.name}</div>
            ${castle.province ? `<div style="font-size:10px;color:#92400e;margin-bottom:2px;font-weight:700">${castle.province}国</div>` : ""}
            ${castle.pref ? `<div style="font-size:10px;color:#78716c;margin-bottom:4px">${castle.pref}</div>` : ""}
            ${castle.visitDate ? `<div style="font-size:11px;color:#666;margin-bottom:4px">📅 ${castle.visitDate}</div>` : ""}
            <div>${starsHtml}</div>
          </div>
        `);

      markersRef.current.push(marker);
    });
  }, [castles, mapReady]);

  const validCount = castles.filter((c) => PREF_COORDS[c.pref]).length;

  return (
    <div className="relative" style={{ height: "calc(100vh - 112px)" }}>
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-50 z-10">
          <Loader2 className="animate-spin text-stone-300 mb-3" size={32} />
          <span className="text-xs font-black text-stone-300 uppercase tracking-widest">マップ読み込み中...</span>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
      {mapReady && (
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md border border-stone-200 z-[1000]">
          <span className="text-[11px] font-black text-stone-600">🏯 {validCount} 城表示中</span>
        </div>
      )}
    </div>
  );
};

// ─── メインアプリ ──────────────────────────────────────

export default function App() {
  const [castles, setCastles] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageType>("list");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "visitDate",
    direction: "desc",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "", aka: "", pref: "", province: "", address: "", visitDate: "", rating: 5, memo: "",
  });

  // ─── Firestore 読み込み ───────────────────────────────
  useEffect(() => {
    setLoading(true);
    const qCol = collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles");
    const unsubscribe = onSnapshot(
      qCol,
      (snap) => { setCastles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error("Firestore error:", err); setLoading(false); }
    );
    return () => unsubscribe();
  }, []);

  // ─── 検索 & ソート ────────────────────────────────────
  const processedData = useMemo(() => {
    let result = castles.filter((c) =>
      (c.name + (c.aka || "") + (c.pref || "") + (c.province || "") + (c.address || "") + (c.memo || ""))
        .toLowerCase().includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      let valA: any, valB: any;
      if (sortConfig.key === "pref") {
        valA = PREF_ORDER.indexOf(a.pref); valB = PREF_ORDER.indexOf(b.pref);
        if (valA === -1) valA = 999; if (valB === -1) valB = 999;
      } else if (sortConfig.key === "visitDate") {
        const toDate = (v: any) => { if (!v) return 0; if (v.toDate) return v.toDate().getTime(); return new Date(v).getTime(); };
        valA = toDate(a.visitDate); valB = toDate(b.visitDate);
      } else if (sortConfig.key === "rating") {
        valA = a.rating || 0; valB = b.rating || 0;
      } else {
        valA = (a[sortConfig.key] || "").toString(); valB = (b[sortConfig.key] || "").toString();
      }
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    return result;
  }, [castles, searchTerm, sortConfig]);

  // ─── 保存 ─────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    try {
      const ref = editingId
        ? doc(db, "artifacts", appId, "users", FIXED_USER_ID, "castles", editingId)
        : doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
      await setDoc(ref, { ...formData, visitDate: (formData.visitDate || "").replace(/\//g, "-"), updatedAt: new Date().toISOString() });
      setIsFormOpen(false); setEditingId(null);
      setFormData({ name: "", aka: "", pref: "", province: "", address: "", visitDate: "", rating: 5, memo: "" });
    } catch (err) { console.error("Save error:", err); }
  };

  // ─── CSV インポート ───────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target!.result as ArrayBuffer;
        let text = new TextDecoder("shift-jis").decode(buffer);
        if (!text.includes("城名")) text = new TextDecoder("utf-8").decode(buffer);
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
        if (lines.length < 2) throw new Error("データが足りません");
        const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const findColumn = (keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
        const col = {
          pref: findColumn(["都道府県"]), name: findColumn(["城名"]), aka: findColumn(["別名"]),
          prov: findColumn(["旧国"]), addr: findColumn(["住所"]), date: findColumn(["訪問日"]), memo: findColumn(["メモ"]),
        };
        if (col.name === -1) throw new Error("「城名」の列が見つかりません");
        const batch = writeBatch(db);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, ""));
          const name = cols[col.name]; if (!name) continue;
          const newRef = doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
          batch.set(newRef, {
            name, pref: col.pref !== -1 ? cols[col.pref] : "", aka: col.aka !== -1 ? cols[col.aka] : "",
            province: col.prov !== -1 ? cols[col.prov] : "", address: col.addr !== -1 ? cols[col.addr] : "",
            visitDate: col.date !== -1 ? cols[col.date].replace(/\//g, "-") : "",
            rating: 5, memo: col.memo !== -1 ? cols[col.memo] : "", updatedAt: new Date().toISOString(),
          });
          count++; if (count >= 450) break;
        }
        await batch.commit();
        alert(`${count} 件をインポートしました！`);
        setShowSettings(false);
      } catch (err: any) { alert(`エラー: ${err.message}`); }
      finally { setIsImporting(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleSort = (key: string) =>
    setSortConfig((p) => ({ key, direction: p.key === key && p.direction === "desc" ? "asc" : "desc" }));

  // ─── レンダリング ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-stone-800 font-sans">

      {/* ── ヘッダー ── */}
      <header className="bg-white/95 border-b border-stone-200 sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CastleIcon />
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-black tracking-tighter text-stone-900">攻城記録</h1>
              <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-black border border-amber-200">
                {castles.length} 城
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSettings(true)} className="p-2 text-stone-400 hover:text-stone-800 transition-colors">
              <Settings size={22} />
            </button>
            {currentPage === "list" && (
              <button
                onClick={() => { setEditingId(null); setFormData({ name: "", aka: "", pref: "", province: "", address: "", visitDate: "", rating: 5, memo: "" }); setIsFormOpen(true); }}
                className="bg-[#B7410E] text-white px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1 shadow-md active:scale-95 transition-all hover:bg-[#9a3509]"
              >
                <Plus size={18} /> 追加
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── メインコンテンツ ── */}
      <main className={currentPage === "map" ? "" : "max-w-5xl mx-auto p-4 md:p-6"}>

        {/* ══ 訪問記録ページ ══ */}
        {currentPage === "list" && (
          <>
            {/* 検索 */}
            <div className="mb-6 space-y-3">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-stone-600 transition-colors" size={20} />
                <input
                  type="text"
                  placeholder="城名、県名、旧国、住所、メモで検索..."
                  className="w-full p-4 pl-12 bg-white border border-stone-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-amber-400/10 focus:border-amber-300 shadow-sm transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-400">
                    {processedData.length} 件
                  </div>
                )}
              </div>

              {/* ソートボタン */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { label: "訪問日順", key: "visitDate" },
                  { label: "都道府県順", key: "pref" },
                  { label: "評価順", key: "rating" },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => toggleSort(item.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black border whitespace-nowrap transition-all ${
                      sortConfig.key === item.key
                        ? "bg-[#B7410E] text-white border-[#B7410E] shadow"
                        : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                    }`}
                  >
                    {item.label}
                    {sortConfig.key === item.key && (sortConfig.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                ))}
              </div>
            </div>

            {/* カード一覧 */}
            {loading ? (
              <div className="flex flex-col items-center py-32 text-stone-300 animate-pulse">
                <Loader2 className="animate-spin mb-4" size={40} />
                <span className="text-xs font-black uppercase tracking-widest">Loading Records...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-28">
                {processedData.map((castle) => (
                  <div
                    key={castle.id}
                    className="bg-white border border-stone-200 rounded-[28px] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group"
                  >
                    {/* 都道府県・旧国タグ */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                        {castle.pref || "未設定"}
                      </span>
                      {castle.province && (
                        <span className="text-[10px] font-black text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
                          {castle.province}
                        </span>
                      )}
                    </div>

                    {/* 城名 + 評価（同一行） */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-lg font-black text-stone-900 leading-tight flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{castle.name}</span>
                        <a
                          href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(castle.name)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-stone-200 hover:text-stone-600 transition-colors shrink-0"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </h3>
                      <Stars rating={castle.rating || 5} size={12} />
                    </div>

                    {castle.aka && (
                      <p className="text-[11px] text-stone-400 font-medium mb-3 truncate">別名: {castle.aka}</p>
                    )}

                    {/* 詳細情報 */}
                    <div className="space-y-1.5 text-[12px] text-stone-500">
                      <div className="flex items-center gap-2 font-bold text-stone-700">
                        <Calendar size={12} className="text-amber-400 shrink-0" />
                        {castle.visitDate || "未訪問"}
                      </div>
                      {castle.address && (
                        <div className="flex items-start gap-2">
                          <MapPin size={12} className="text-stone-300 mt-0.5 shrink-0" />
                          <span className="line-clamp-1">{castle.address}</span>
                        </div>
                      )}
                      {castle.memo && (
                        <div className="mt-2 p-2.5 bg-amber-50/60 rounded-xl text-stone-600 line-clamp-2 italic text-[11px] border border-amber-100">
                          {castle.memo}
                        </div>
                      )}
                    </div>

                    {/* フッター（編集・削除） */}
                    <div className="flex justify-end items-center pt-3 mt-3 border-t border-stone-50">
                      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setFormData({ ...castle }); setEditingId(castle.id); setIsFormOpen(true); }}
                          className="p-2 bg-stone-50 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-all"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`${castle.name}の記録を削除しますか？`)) {
                              await deleteDoc(doc(db, "artifacts", appId, "users", FIXED_USER_ID, "castles", castle.id));
                            }
                          }}
                          className="p-2 bg-stone-50 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ 都道府県一覧ページ ══ */}
        {currentPage === "prefecture" && <PrefecturePage castles={castles} />}

        {/* ══ マップページ ══ */}
        {currentPage === "map" && <MapPage castles={castles} />}
      </main>

      {/* ── ボトムナビゲーション ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-stone-200 z-50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex">
          {[
            { page: "list" as PageType, label: "訪問記録", Icon: LayoutList },
            { page: "prefecture" as PageType, label: "都道府県", Icon: Flag },
            { page: "map" as PageType, label: "マップ", Icon: Map },
          ].map(({ page, label, Icon }) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[10px] font-black transition-colors ${
                currentPage === page ? "text-[#B7410E]" : "text-stone-400 hover:text-stone-600"
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── 設定モーダル ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-stone-900/40 z-[110] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[48px] shadow-2xl p-12 text-center">
            <h2 className="text-2xl font-black mb-10 text-stone-900">データ管理</h2>
            <div className="space-y-4">
              <button
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all"
              >
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

              <button
                onClick={() => {
                  const header = "都道府県,城名,別名,旧国,住所,訪問日,評価,メモ\n";
                  const rows = castles.map((c) =>
                    `"${c.pref || ""}","${c.name}","${c.aka || ""}","${c.province || ""}","${c.address || ""}","${c.visitDate || ""}",${c.rating},"${c.memo || ""}"`
                  ).join("\n");
                  const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), header + rows], { type: "text/csv;charset=utf-8;" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                  a.download = `城郭記録_${new Date().toISOString().split("T")[0]}.csv`; a.click();
                }}
                className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm"><Download size={20} className="text-stone-800" /></div>
                  <div className="text-left">
                    <p className="text-stone-900">バックアップ保存</p>
                    <p className="text-[10px] text-stone-400 font-normal">現在のデータをCSV出力</p>
                  </div>
                </div>
                <ArrowDown size={16} className="text-stone-300" />
              </button>
            </div>
            <button onClick={() => setShowSettings(false)} className="mt-12 text-stone-300 font-black text-[10px] uppercase tracking-widest hover:text-stone-800 transition-colors">
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ── 登録・編集フォームモーダル ── */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-stone-900/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-t-[40px] md:rounded-[40px] shadow-2xl flex flex-col max-h-[94vh]">
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-stone-900">{editingId ? "記録を編集" : "新しい城郭を登録"}</h2>
              <button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-stone-300 hover:text-stone-800 bg-stone-50 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto">
              <form onSubmit={handleSave} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">城郭名</label>
                  <input required placeholder="例: 姫路城" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent font-black text-stone-900 outline-none focus:bg-white focus:border-stone-200 transition-colors" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">別名</label>
                    <input placeholder="例: 白鷺城" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors" value={formData.aka} onChange={(e) => setFormData({ ...formData, aka: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">旧国名</label>
                    <input placeholder="例: 播磨" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors" value={formData.province} onChange={(e) => setFormData({ ...formData, province: e.target.value })} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">都道府県</label>
                    <input placeholder="例: 兵庫県" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors" value={formData.pref} onChange={(e) => setFormData({ ...formData, pref: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">訪問日</label>
                    <input placeholder="例: 2024-04-01" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors" value={formData.visitDate} onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">所在地</label>
                  <input placeholder="住所を入力" className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">メモ・備考</label>
                  <textarea placeholder="造構の状態や、アクセス時の注意点など…" rows={3} className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors resize-none" value={formData.memo} onChange={(e) => setFormData({ ...formData, memo: e.target.value })} />
                </div>

                <div className="space-y-1.5 text-center">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">満足度</label>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setFormData({ ...formData, rating: n })} className={`text-3xl transition-transform active:scale-90 ${formData.rating >= n ? "text-amber-400" : "text-stone-200"}`}>★</button>
                    ))}
                  </div>
                </div>

                <button type="submit" className="w-full bg-[#B7410E] text-white py-4 rounded-[24px] font-black shadow-xl hover:bg-[#9a3509] transition-all">
                  記録を保存
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
