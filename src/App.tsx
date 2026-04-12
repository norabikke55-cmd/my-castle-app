import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection, onSnapshot, doc, deleteDoc, setDoc, writeBatch
} from 'firebase/firestore';
import {
  Search, Calendar, Trash2, Plus, Star, X, Settings,
  Edit3, MapPin, Download, FileUp, ExternalLink,
  Loader2, ArrowUp, ArrowDown, LayoutList, Flag, Map, Camera, XCircle
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

const stableHash = (str: string): number => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
};

// ─── 写真圧縮ユーティリティ ─────────────────────────────
const MAX_BYTES = 50 * 1024; // 50KB

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
  // 試行1: 長辺400px・品質70%
  let data = await compressImage(file, 400, 0.70);
  if (Math.round((data.length * 3) / 4) <= MAX_BYTES) return { data };

  // 試行2: 長辺300px・品質60%
  data = await compressImage(file, 300, 0.60);
  const bytes = Math.round((data.length * 3) / 4);
  if (bytes <= MAX_BYTES) return { data };

  return {
    data: "",
    error: `圧縮後も ${Math.round(bytes / 1024)}KB になりました。より小さい画像を選んでください。`,
  };
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
      {/* サマリーバナー */}
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
            {castles.length}<span className="text-sm font-normal text-stone-400 ml-1">城</span>
          </p>
        </div>
      </div>

      {/* 都道府県グループ */}
      <div className="space-y-3">
        {grouped.map(({ pref, items }) => (
          <div key={pref} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-black text-sm text-stone-400">{pref}</h3>
              <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {items.length} 城
              </span>
            </div>
            <div className="divide-y divide-stone-50">
              {[...items].sort((a, b) => (b.rating || 5) - (a.rating || 5)).map((castle) => (
                <div key={castle.id} className="pl-10 pr-5 py-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-stone-800 truncate">{castle.name}</span>
                  <Stars rating={castle.rating || 5} size={11} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 未訪問都道府県 */}
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

// ─── マップページ（OpenStreetMap / Leaflet） ────────────

const MapPage = ({ castles }: { castles: any[] }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

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
      const map = L.map(mapRef.current, { zoomControl: true }).setView([36.5, 137.0], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);
      mapInstanceRef.current = map;
      setMapReady(true);
    };

    if ((window as any).L) { init(); }
    else {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = init;
      document.head.appendChild(s);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    const L = (window as any).L;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const markerColor = (r: number) =>
      r >= 5 ? "#B7410E" : r >= 4 ? "#C06030" : r >= 3 ? "#7c6a56" : "#9ca3af";

    castles.forEach((castle) => {
      const coords = PREF_COORDS[castle.pref];
      if (!coords) return;
      const h = stableHash(castle.id || castle.name);
      const lat = coords[0] + (((h & 0xff) - 128) / 128) * 0.22;
      const lng = coords[1] + ((((h >> 8) & 0xff) - 128) / 128) * 0.22;
      const color = markerColor(castle.rating || 5);

      const icon = L.divIcon({
        html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏯</div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
      });

      const starsHtml = [1,2,3,4,5].map((n) =>
        `<span style="color:${n <= (castle.rating||5) ? "#F59E0B" : "#e5e7eb"};font-size:13px">★</span>`
      ).join("");

      const marker = L.marker([lat, lng], { icon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family:sans-serif;min-width:140px;padding:2px">
            <div style="font-weight:900;font-size:14px;margin-bottom:3px;color:#1c1917">${castle.name}</div>
            ${castle.province ? `<div style="font-size:10px;color:#92400e;font-weight:700;margin-bottom:2px">${castle.province}国</div>` : ""}
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
    // ヘッダー約64px + ナビ約56px = 120px を引いた高さ
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
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md border border-stone-200 z-[1000]">
            <span className="text-[11px] font-black text-stone-600">🏯 {validCount} 城表示中</span>
          </div>
          <div className="absolute bottom-16 left-3 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-md border border-stone-200 z-[1000]">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5">評価</p>
            {[
              { color: "#B7410E", label: "★★★★★" },
              { color: "#C06030", label: "★★★★" },
              { color: "#7c6a56", label: "★★★" },
              { color: "#9ca3af", label: "★★以下" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1 last:mb-0">
                <div style={{ background: color }} className="w-3.5 h-3.5 rounded-full border border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-bold text-stone-600">{label}</span>
              </div>
            ))}
          </div>
        </>
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
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "visitDate", direction: "desc" });
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = { name: "", aka: "", pref: "", province: "", address: "", visitDate: "", rating: 5, memo: "", photo: "" };
  const [formData, setFormData] = useState<typeof emptyForm>(emptyForm);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);

  // ─── Firestore 読み込み ───────────────────────────────
  useEffect(() => {
    setLoading(true);
    const qCol = collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles");
    const unsub = onSnapshot(qCol,
      (snap) => { setCastles(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  // ─── 検索 & ソート ────────────────────────────────────
  const processedData = useMemo(() => {
    let result = castles.filter((c) =>
      (c.name+(c.aka||"")+(c.pref||"")+(c.province||"")+(c.address||"")+(c.memo||""))
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
        valA = (a[sortConfig.key]||"").toString(); valB = (b[sortConfig.key]||"").toString();
      }
      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
      return (b.updatedAt||"").localeCompare(a.updatedAt||"");
    });
    return result;
  }, [castles, searchTerm, sortConfig]);

  // ─── 写真選択・圧縮 ───────────────────────────────────
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(""); setPhotoLoading(true);
    try {
      const result = await processPhoto(file);
      if (result.error) {
        setPhotoError(result.error);
        setPhotoPreview("");
        setFormData((f) => ({ ...f, photo: "" }));
      } else {
        setPhotoPreview(result.data);
        setFormData((f) => ({ ...f, photo: result.data }));
      }
    } catch {
      setPhotoError("画像の処理に失敗しました。別のファイルをお試しください。");
    } finally {
      setPhotoLoading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // ─── 保存 ─────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    try {
      const ref = editingId
        ? doc(db, "artifacts", appId, "users", FIXED_USER_ID, "castles", editingId)
        : doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
      await setDoc(ref, {
        ...formData,
        visitDate: (formData.visitDate||"").replace(/\//g, "-"),
        updatedAt: new Date().toISOString(),
      });
      setIsFormOpen(false); setEditingId(null);
      setFormData(emptyForm); setPhotoPreview(""); setPhotoError("");
    } catch (err) { console.error(err); }
  };

  // ─── フォームを開く ───────────────────────────────────
  const openForm = (castle?: any) => {
    if (castle) {
      setFormData({ ...emptyForm, ...castle });
      setPhotoPreview(castle.photo || "");
      setEditingId(castle.id);
    } else {
      setFormData(emptyForm);
      setPhotoPreview("");
      setEditingId(null);
    }
    setPhotoError("");
    setIsFormOpen(true);
  };

  // ─── CSV インポート ───────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        const batch = writeBatch(db);
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.replace(/^"|"$/g, ""));
          const name = cols[col.name]; if (!name) continue;
          const ref = doc(collection(db, "artifacts", appId, "users", FIXED_USER_ID, "castles"));
          batch.set(ref, {
            name, pref: col.pref !== -1 ? cols[col.pref] : "", aka: col.aka !== -1 ? cols[col.aka] : "",
            province: col.prov !== -1 ? cols[col.prov] : "", address: col.addr !== -1 ? cols[col.addr] : "",
            visitDate: col.date !== -1 ? cols[col.date].replace(/\//g, "-") : "",
            rating: 5, memo: col.memo !== -1 ? cols[col.memo] : "",
            photo: "", updatedAt: new Date().toISOString(),
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
            {/* 歯車と追加ボタンは訪問記録ページのみ */}
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
          </div>
        </div>
      </header>

      {/* ── メインコンテンツ ── */}
      <main className={currentPage === "map" ? "" : "max-w-5xl mx-auto p-4 md:p-6"}>

        {/* ══ 訪問記録ページ ══ */}
        {currentPage === "list" && (
          <>
            <div className="mb-6 space-y-3">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-stone-600 transition-colors" size={20} />
                <input type="text" placeholder="城名、県名、旧国、住所、メモで検索..."
                  className="w-full p-4 pl-12 bg-white border border-stone-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-amber-400/10 focus:border-amber-300 shadow-sm transition-all"
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                {searchTerm && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-400">
                    {processedData.length} 件
                  </div>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { label: "訪問日順", key: "visitDate" },
                  { label: "都道府県順", key: "pref" },
                  { label: "評価順", key: "rating" },
                ].map((item) => (
                  <button key={item.key} onClick={() => toggleSort(item.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-black border whitespace-nowrap transition-all ${
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

            {loading ? (
              <div className="flex flex-col items-center py-32 text-stone-300 animate-pulse">
                <Loader2 className="animate-spin mb-4" size={40} />
                <span className="text-xs font-black uppercase tracking-widest">Loading Records...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-28">
                {processedData.map((castle) => (
                  <div key={castle.id}
                    className="bg-white border border-stone-200 rounded-[28px] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">

                    {/* 都道府県・旧国タグ + 写真サムネイル */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                          {castle.pref || "未設定"}
                        </span>
                        {castle.province && (
                          <span className="text-[10px] font-black text-stone-600 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
                            {castle.province}
                          </span>
                        )}
                      </div>
                      {/* 写真サムネイル（角丸四角） */}
                      {castle.photo && (
                        <button onClick={() => setZoomedPhoto(castle.photo)}
                          className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-stone-200 shadow-sm hover:shadow-md hover:scale-105 transition-all">
                          <img src={castle.photo} alt={castle.name} className="w-full h-full object-cover" />
                        </button>
                      )}
                    </div>

                    {/* 城名 + 評価 */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-lg font-black text-stone-900 leading-tight flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{castle.name}</span>
                        <a href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(castle.name)}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-stone-200 hover:text-stone-600 transition-colors shrink-0">
                          <ExternalLink size={13} />
                        </a>
                      </h3>
                      <Stars rating={castle.rating || 5} size={12} />
                    </div>

                    {/* 別名（固定行） */}
                    <p className="text-[11px] text-stone-400 font-medium mb-3 truncate h-[16px]">
                      {castle.aka ? `別名: ${castle.aka}` : ""}
                    </p>

                    {/* 詳細情報（固定行） */}
                    <div className="space-y-1.5 text-[12px] text-stone-500">
                      <div className="flex items-center gap-2 font-bold text-stone-700 h-[18px]">
                        <Calendar size={12} className="text-amber-400 shrink-0" />
                        <span>{castle.visitDate || ""}</span>
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

                    {/* 編集・削除 */}
                    <div className="flex justify-end gap-1 mt-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
        {currentPage === "map" && <MapPage castles={castles} />}
      </main>

      {/* ── ボトムナビゲーション ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-stone-200 z-[2000] backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex">
          {[
            { page: "list" as PageType, label: "訪問記録", Icon: LayoutList },
            { page: "prefecture" as PageType, label: "都道府県", Icon: Flag },
            { page: "map" as PageType, label: "マップ", Icon: Map },
          ].map(({ page, label, Icon }) => (
            <button key={page} onClick={() => setCurrentPage(page)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[10px] font-black transition-colors ${
                currentPage === page ? "text-[#B7410E]" : "text-stone-400 hover:text-stone-600"
              }`}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── 写真拡大モーダル ── */}
      {zoomedPhoto && (
        <div className="fixed inset-0 bg-stone-900/80 z-[3000] flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setZoomedPhoto(null)}>
          <div className="relative max-w-lg w-full">
            <img src={zoomedPhoto} alt="城の写真" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
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
                const header = "都道府県,城名,別名,旧国,住所,訪問日,評価,メモ\n";
                const rows = castles.map((c) =>
                  `"${c.pref||""}","${c.name}","${c.aka||""}","${c.province||""}","${c.address||""}","${c.visitDate||""}",${c.rating},"${c.memo||""}"`
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
            </div>
            <button onClick={() => setShowSettings(false)}
              className="mt-12 text-stone-300 font-black text-[10px] uppercase tracking-widest hover:text-stone-800 transition-colors">
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
              <button type="button" onClick={() => setIsFormOpen(false)}
                className="p-2 text-stone-300 hover:text-stone-800 bg-stone-50 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto" style={{ paddingBottom: "80px" }}>
              <form onSubmit={handleSave} className="space-y-5">

                <div className="space-y-1.5">
                  <label htmlFor="f-name" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">城郭名</label>
                  <input id="f-name" name="name" required placeholder="例: 姫路城"
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="f-pref" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">都道府県</label>
                    <input id="f-pref" name="pref" placeholder="例: 兵庫県"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.pref} onChange={(e) => setFormData({ ...formData, pref: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="f-date" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">訪問日</label>
                    <input id="f-date" name="visitDate" type="date"
                      className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                      value={formData.visitDate} onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="f-address" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">所在地</label>
                  <input id="f-address" name="address" placeholder="住所を入力"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors"
                    value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="f-memo" className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">メモ・備考</label>
                  <textarea id="f-memo" name="memo" placeholder="造構の状態や、アクセス時の注意点など…" rows={3}
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-colors resize-none"
                    value={formData.memo} onChange={(e) => setFormData({ ...formData, memo: e.target.value })} />
                </div>

                {/* 写真アップロード */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">写真</label>
                  <div className="flex items-start gap-3">
                    {/* プレビュー */}
                    <div className="w-20 h-20 rounded-lg border border-stone-200 overflow-hidden bg-stone-50 flex items-center justify-center shrink-0">
                      {photoLoading ? (
                        <Loader2 size={20} className="animate-spin text-stone-300" />
                      ) : photoPreview ? (
                        <img src={photoPreview} alt="プレビュー" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={24} className="text-stone-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <button type="button" onClick={() => photoInputRef.current?.click()}
                        className="w-full py-2.5 px-4 bg-stone-50 border border-stone-200 rounded-[14px] text-[11px] font-black text-stone-600 hover:bg-stone-100 transition-colors flex items-center justify-center gap-2">
                        <Camera size={14} />
                        {photoPreview ? "写真を変更" : "写真を選択"}
                      </button>
                      {photoPreview && (
                        <button type="button"
                          onClick={() => { setPhotoPreview(""); setFormData((f) => ({ ...f, photo: "" })); setPhotoError(""); }}
                          className="w-full py-2 px-4 bg-rose-50 border border-rose-100 rounded-[14px] text-[11px] font-black text-rose-400 hover:bg-rose-100 transition-colors flex items-center justify-center gap-2">
                          <XCircle size={13} /> 写真を削除
                        </button>
                      )}
                      <p className="text-[10px] text-stone-400 ml-1">自動圧縮・上限 50KB</p>
                      {photoError && (
                        <p className="text-[10px] text-rose-500 bg-rose-50 rounded-lg px-2 py-1.5 border border-rose-100">{photoError}</p>
                      )}
                    </div>
                  </div>
                  <input type="file" accept="image/*" ref={photoInputRef} onChange={handlePhotoSelect} className="hidden" />
                </div>

                {/* 満足度 */}
                <div className="space-y-1.5 text-center">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">満足度</label>
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setFormData({ ...formData, rating: n })}
                        className={`text-3xl transition-transform active:scale-90 ${formData.rating >= n ? "text-amber-400" : "text-stone-200"}`}>★</button>
                    ))}
                  </div>
                </div>

                <button type="submit"
                  className="w-full bg-[#B7410E] text-white py-4 rounded-[24px] font-black shadow-xl hover:bg-[#9a3509] transition-all">
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
