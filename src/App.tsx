import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, onSnapshot, doc, deleteDoc, setDoc, writeBatch 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Search, Calendar, Trash2, Plus, Star, X, Settings, 
  Edit3, MapPin, Download, FileUp, ExternalLink, 
  Loader2, Save, ArrowUp, ArrowDown, FileText
} from 'lucide-react';

// --- Firebase Config (StackBlitz 用) ---
const firebaseConfig = {
  apiKey: "AIzaSyBWBUJ3D0ArkjYBcknRXE4d8n_nc_Jumq0",
  authDomain: "castle-104.firebaseapp.com",
  projectId: "castle-104",
  storageBucket: "castle-104.firebasestorage.app",
  messagingSenderId: "214626260016",
  appId: "1:214626260016:web:8c7a036689295a074d09f5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'castle-log-v7-stable';

// 都道府県の並び順
const PREF_ORDER = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県",
  "三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県",
  "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

// --- 城アイコン ---
const CastleIcon = () => (
  <div className="relative w-12 h-12 flex items-center justify-center overflow-hidden">
    <svg viewBox="0 0 100 100" className="w-10 h-10" fill="none">
      <rect x="0" y="0" width="100" height="100" rx="18" fill="#D2B48C" />
      <circle cx="20" cy="25" r="8" fill="white" fillOpacity="0.3" />
      <circle cx="28" cy="25" r="5" fill="white" fillOpacity="0.3" />
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

export default function App() {
  const [user, setUser] = useState(null);
  const [castles, setCastles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'visitDate', direction: 'desc' });
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '', aka: '', pref: '', province: '', address: '',
    visitDate: '', rating: 5, memo: ''
  });
  // --- Firebase Auth ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, u => setUser(u));
    return () => unsubscribe();
  }, []);
  // --- Firestore 読み込み ---
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const qCol = collection(db, 'artifacts', appId, 'users', user.uid, 'castles');
    const unsubscribe = onSnapshot(
      qCol,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCastles(data);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // --- 検索 & ソート ---
  const processedData = useMemo(() => {
    let result = castles.filter((c) =>
      (
        c.name +
        (c.aka || "") +
        (c.pref || "") +
        (c.province || "") +
        (c.address || "") +
        (c.memo || "")
      )
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      let valA, valB;

      if (sortConfig.key === "pref") {
        valA = PREF_ORDER.indexOf(a.pref);
        valB = PREF_ORDER.indexOf(b.pref);
        if (valA === -1) valA = 999;
        if (valB === -1) valB = 999;
      } else if (sortConfig.key === "visitDate") {
        const normalize = (d) =>
          d ? d.toString().replace(/\//g, "-") : "0000-00-00";
        valA = normalize(a.visitDate);
        valB = normalize(b.visitDate);
      } else {
        valA = (a[sortConfig.key] || "").toString();
        valB = (b[sortConfig.key] || "").toString();
      }

      if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;

      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });

    return result;
  }, [castles, searchTerm, sortConfig]);

  // --- 保存（新規 or 編集） ---
  const handleSave = async (e) => {
    e.preventDefault();
    if (!user || !formData.name) return;

    try {
      const ref = editingId
        ? doc(db, "artifacts", appId, "users", user.uid, "castles", editingId)
        : doc(collection(db, "artifacts", appId, "users", user.uid, "castles"));

      await setDoc(ref, {
        ...formData,
        visitDate: (formData.visitDate || "").replace(/\//g, "-"),
        updatedAt: new Date().toISOString(),
      });

      setIsFormOpen(false);
      setEditingId(null);
      setFormData({
        name: "",
        aka: "",
        pref: "",
        province: "",
        address: "",
        visitDate: "",
        rating: 5,
        memo: "",
      });
    } catch (err) {
      console.error(err);
    }
  };

  // --- CSV インポート ---
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const buffer = ev.target.result;
        let text = new TextDecoder("shift-jis").decode(buffer);

        if (!text.includes("城名")) {
          text = new TextDecoder("utf-8").decode(buffer);
        }

        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l !== "");

        if (lines.length < 2) throw new Error("データが足りません");

        const header = lines[0]
          .split(",")
          .map((h) => h.trim().replace(/^"|"$/g, ""));

        const findColumn = (keys) =>
          header.findIndex((h) => keys.some((k) => h.includes(k)));

        const col = {
          pref: findColumn(["都道府県"]),
          name: findColumn(["城名"]),
          aka: findColumn(["別名"]),
          prov: findColumn(["旧国"]),
          addr: findColumn(["住所"]),
          date: findColumn(["訪問日"]),
          memo: findColumn(["メモ"]),
        };

        if (col.name === -1) throw new Error("「城名」の列が見つかりません");

        const batch = writeBatch(db);
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i]
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((c) => c.replace(/^"|"$/g, ""));

          const name = cols[col.name];
          if (!name) continue;

          const newRef = doc(
            collection(db, "artifacts", appId, "users", user.uid, "castles")
          );

          batch.set(newRef, {
            name,
            pref: col.pref !== -1 ? cols[col.pref] : "",
            aka: col.aka !== -1 ? cols[col.aka] : "",
            province: col.prov !== -1 ? cols[col.prov] : "",
            address: col.addr !== -1 ? cols[col.addr] : "",
            visitDate:
              col.date !== -1 ? cols[col.date].replace(/\//g, "-") : "",
            rating: 5,
            memo: col.memo !== -1 ? cols[col.memo] : "",
            updatedAt: new Date().toISOString(),
          });

          count++;
          if (count >= 450) break;
        }

        await batch.commit();
        alert(`${count} 件をインポートしました！`);
        setShowSettings(false);
      } catch (err) {
        alert(`エラー: ${err.message}`);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };
  return (
    <div className="min-h-screen bg-[#FDFCFB] text-stone-800 font-sans pb-24">
      {/* --- Header --- */}
      <header className="bg-white/95 border-b border-stone-200 sticky top-0 z-50 p-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CastleIcon />
            <div className="flex items-baseline gap-2">
              <h1 className="text-xl font-black tracking-tighter text-stone-900">攻城記録</h1>
              <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md text-[10px] font-black border border-stone-200">
                {castles.length} 城
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-stone-400 hover:text-stone-800 transition-colors"
            >
              <Settings size={22} />
            </button>

            <button
              onClick={() => {
                setEditingId(null);
                setFormData({
                  name: "",
                  aka: "",
                  pref: "",
                  province: "",
                  address: "",
                  visitDate: "",
                  rating: 5,
                  memo: "",
                });
                setIsFormOpen(true);
              }}
              className="bg-stone-800 text-white px-5 py-2.5 rounded-full text-xs font-black flex items-center gap-1 shadow-md active:scale-95 transition-all"
            >              <Plus size={18} /> 追加
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-5xl mx-auto p-4 md:p-6">
        {/* Search */}
        <div className="mb-8 space-y-4">
          <div className="relative group">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-stone-800 transition-colors"
              size={20}
            />

<input
              type="text"
              placeholder="城名、県名、旧国、住所、メモで検索..."
              className="w-full p-4 pl-12 bg-white border border-stone-200 rounded-2xl text-sm outline-none focus:ring-4 focus:ring-stone-800/5 shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-stone-400">
                {processedData.length} 件
              </div>
            )}
          </div>

          {/* Sort Buttons */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {[
              { label: "訪問日順", key: "visitDate" },
              { label: "都道府県順", key: "pref" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() =>
                  setSortConfig((p) => ({
                    key: item.key,
                    direction:
                      p.key === item.key && p.direction === "desc"
                        ? "asc"
                        : "desc",
                  }))
                }
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[11px] font-black border whitespace-nowrap transition-all ${
                  sortConfig.key === item.key
                    ? "bg-stone-800 text-white border-stone-800 shadow-lg"
                    : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                }`}
              >
                {item.label}
                {sortConfig.key === item.key &&
                  (sortConfig.direction === "asc" ? (
                    <ArrowUp size={12} />
                  ) : (
                    <ArrowDown size={12} />
                  ))}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center py-32 text-stone-300 animate-pulse">
            <Loader2 className="animate-spin mb-4" size={40} />
            <span className="text-xs font-black uppercase tracking-widest">
              Loading Records...
            </span>
          </div>
        ) : (
          /* Castle Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {processedData.map((castle) => (
              <div
                key={castle.id}
                className="bg-white border border-stone-200 rounded-[32px] p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full"
              >
                {/* Tags */}
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-[10px] font-black text-stone-500 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {castle.pref || "未設定"}
                    </span>

                    {castle.province && (
                      <span className="text-[10px] font-black text-stone-600 bg-white border border-stone-300 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {castle.province}
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <h3 className="text-xl font-black text-stone-900 leading-tight mb-1 flex items-center gap-2">
                    {castle.name}
                    <a
                      href={`https://ja.wikipedia.org/wiki/${encodeURIComponent(
                        castle.name
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-200 hover:text-stone-800 transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </h3>
                  {castle.aka && (
                    <p className="text-[11px] text-stone-400 font-medium truncate">
                      別名: {castle.aka}
                    </p>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-2.5 text-[12px] mb-4 text-stone-500 flex-grow">
                  <div className="flex items-center gap-3 font-bold text-stone-800">
                    <Calendar size={14} className="text-stone-300" />{" "}
                    {castle.visitDate || "未訪問"}
                  </div>
                  {castle.address && (
                    <div className="flex items-start gap-3">
                      <MapPin
                        size={14}
                        className="text-stone-300 mt-0.5 shrink-0"
                      />
                      <span className="line-clamp-1">{castle.address}</span>
                    </div>
                  )}

                  {castle.memo && (
                    <div className="mt-3 p-3 bg-stone-50 rounded-xl text-stone-600 line-clamp-3 italic text-[11px] border border-stone-100">
                      {castle.memo}
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div className="flex justify-between items-center pt-5 border-t border-stone-50 mt-auto">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={14}
                        className={`${
                          star <= (castle.rating || 5)
                            ? "fill-amber-400 text-amber-400"
                            : "text-stone-200"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setFormData({ ...castle });
                        setEditingId(castle.id);
                        setIsFormOpen(true);
                      }}
                      className="p-2.5 bg-stone-50 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-full transition-all"
                    >
                      <Edit3 size={16} />
                    </button>

                    <button
                      onClick={async () => {
                        if (window.confirm(`${castle.name}の記録を削除しますか？`)) {
                          await deleteDoc(
                            doc(
                              db,
                              "artifacts",
                              appId,
                              "users",
                              user.uid,
                              "castles",
                              castle.id
                            )
                            );
                          }
                        }}
                        className="p-2.5 bg-stone-50 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
  
        {/* --- Settings Modal --- */}
        {showSettings && (
          <div className="fixed inset-0 bg-stone-900/40 z-[110] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[48px] shadow-2xl p-12 text-center">
              <h2 className="text-2xl font-black mb-10 text-stone-900">データ管理</h2>
  
              <div className="space-y-4">
              {/* CSV Import */}
              <button
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <FileUp size={20} className="text-stone-800" />
                  </div>
                  <div className="text-left">
                    <p className="text-stone-900">CSVを読み込む</p>
                    <p className="text-[10px] text-stone-400 font-normal">
                      230_castles.csv 対応
                    </p>
                  </div>
                </div>

                {isImporting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} className="text-stone-300" />
                )}
              </button>

              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              {/* CSV Export */}
              <button
                onClick={() => {
                  const header =
                    "都道府県,城名,別名,旧国,住所,訪問日,評価,メモ\n";
                  const rows = castles
                    .map(
                      (c) =>
                        `"${c.pref || ""}","${c.name}","${c.aka || ""}","${
                          c.province || ""
                        }","${c.address || ""}","${c.visitDate || ""}",${
                          c.rating
                        },"${c.memo || ""}"`
                    )
                    .join("\n");

                  const blob = new Blob(
                    [
                      new Uint8Array([0xef, 0xbb, 0xbf]),
                      header + rows,
                    ],
                    { type: "text/csv;charset=utf-8;" }
                  );

                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `城郭記録_${new Date()
                    .toISOString()
                    .split("T")[0]}.csv`;
                  a.click();
                }}
                className="w-full flex items-center justify-between p-6 bg-stone-50 rounded-[24px] font-black text-sm hover:bg-stone-100 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Download size={20} className="text-stone-800" />
                  </div>
                  <div className="text-left">
                    <p className="text-stone-900">バックアップ保存</p>
                    <p className="text-[10px] text-stone-400 font-normal">
                      現在のデータをCSV出力
                      </p>
                  </div>
                </div>

                <ArrowDown size={16} className="text-stone-300" />
              </button>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="mt-12 text-stone-300 font-black text-[10px] uppercase tracking-widest hover:text-stone-800 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
      {/* --- Form Modal --- */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-stone-900/60 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-t-[40px] md:rounded-[40px] shadow-2xl flex flex-col max-h-[94vh]">
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-stone-900">
                {editingId ? "記録を編集" : "新しい城郭を登録"}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 text-stone-300 hover:text-stone-800 transition-colors bg-stone-50 rounded-full"
              >
                <X size={24} />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="p-6 md:p-8 space-y-6 overflow-y-auto"
            >
              {/* Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                  城郭名
                </label>
                <input
                  required
                  placeholder="例: 姫路城"
                  className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent font-black text-stone-900 outline-none focus:bg-white focus:border-stone-200 transition-all"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              {/* Aka & Province */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                    別名
                  </label>
                  <input
                    placeholder="例: 白鷺城"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all"
                    value={formData.aka}
                    onChange={(e) =>
                      setFormData({ ...formData, aka: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                    旧国名
                  </label>
                  <input
                    placeholder="例: 播磨"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all"
                    value={formData.province}
                    onChange={(e) =>
                      setFormData({ ...formData, province: e.target.value })
                    }
                  />
                </div>
              </div>
              {/* Pref & Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                    都道府県
                  </label>
                  <input
                    placeholder="兵庫県"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all"
                    value={formData.pref}
                    onChange={(e) =>
                      setFormData({ ...formData, pref: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                    訪問日
                  </label>
                  <input
                    type="date"
                    className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all"
                    value={formData.visitDate}
                    onChange={(e) =>
                      setFormData({ ...formData, visitDate: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1">
                  所在地
                </label>
                <input
                  placeholder="住所を入力"
                  className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                />
              </div>

              {/* Memo */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1.5">
                  <FileText size={12} /> メモ・備考
                </label>
                <textarea
                  placeholder="遺構の状態や、アクセス時の注意点など..."
                  className="w-full p-4 bg-stone-50 rounded-[18px] border border-transparent outline-none text-sm focus:bg-white focus:border-stone-200 transition-all min-h-[120px] resize-none"
                  value={formData.memo}
                  onChange={(e) =>
                    setFormData({ ...formData, memo: e.target.value })
                  }
                />
              </div>

              {/* Rating */}
              <div className="space-y-2 text-center">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em]">
                  満足度
                </label>
                <div className="flex items-center justify-center gap-2 bg-stone-50 rounded-[20px] py-4 border border-transparent">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={24}
                      className={`${
                        s <= formData.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-stone-200"
                      } cursor-pointer hover:scale-110 transition-transform`}
                      onClick={() =>
                        setFormData({ ...formData, rating: s })
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <button
                type="submit"
                className="w-full bg-stone-900 text-white py-5 rounded-[24px] font-black shadow-xl hover:bg-stone-800 transition-all flex items-center justify-center gap-3"
              >
                <Save size={20} /> 記録を保存
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

