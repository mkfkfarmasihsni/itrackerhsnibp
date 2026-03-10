import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Building2, 
  ChevronDown, 
  Search, 
  Clock, 
  Plus, 
  LayoutGrid, 
  Settings, 
  Trash2, 
  User, 
  StickyNote, 
  Eraser, 
  AlertCircle,
  Loader2,
  CheckCircle2, 
  Edit3, 
  Pencil,
  Lock
} from 'lucide-react';

/**
 * CONFIGURASI FIREBASE & GLOBAL
 * Menggunakan window. untuk mengelakkan ralat 'no-undef' di Vercel build
 */
const getEnv = (key) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[`REACT_APP_${key}`] || process.env[`VITE_${key}`] || "";
  }
  return "";
};

// Akses global variables melalui window object untuk bypass ESLint check
const getGlobal = (key) => {
  try {
    // eslint-disable-next-line
    return window[key];
  } catch (e) {
    return undefined;
  }
};

const rawConfig = getGlobal('__firebase_config');
const firebaseConfig = rawConfig 
  ? JSON.parse(rawConfig) 
  : {
      apiKey: getEnv("FIREBASE_API_KEY"),
      authDomain: getEnv("FIREBASE_AUTH_DOMAIN"),
      projectId: getEnv("FIREBASE_PROJECT_ID"),
      storageBucket: getEnv("FIREBASE_STORAGE_BUCKET"),
      messagingSenderId: getEnv("FIREBASE_MESSAGING_SENDER_ID"),
      appId: getEnv("FIREBASE_APP_ID")
    };

const GOOGLE_SHEET_WEBHOOK_URL = getEnv("SHEET_WEBHOOK_URL"); 

const globalAppId = getGlobal('__app_id');
const appId = globalAppId || (getEnv("APP_ID") || 'pharmacy-tracker-v2');

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const INITIAL_UNITS = {
  "Farmasi Satelit 1": ["Floor Stock", "Troli Ubat", "Ubat Tambahan"],
  "Farmasi Satelit 2": ["Floor Stock", "Troli Ubat", "Ubat Tambahan"],
  "Farmasi Pengeluaran": ["Galenikal & Losyen", "Special Drip"],
  "Farmasi Stor Pukal 3": ["IV Drip"],
  "Farmasi Kecemasan": ["Ubat Urgent (AOH)"]
};

const DEFAULT_APP_NAME = "AiPharmHSNI-Indent Tracking";
const ADMIN_PASSWORD = "shah"; 

// --- Fungsi Pembantu ---
const formatDateTime = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  const time = date.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayMonth = date.toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit' });
  return `${dayMonth} | ${time}`;
};

const getUnitColor = (unitName) => {
  const colors = ['text-blue-600', 'text-emerald-600', 'text-purple-600', 'text-pink-600', 'text-orange-600', 'text-cyan-600', 'text-indigo-600', 'text-rose-600'];
  let hash = 0;
  for (let i = 0; i < unitName?.length; i++) hash = unitName.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const syncToGoogleSheets = async (payload) => {
  if (!GOOGLE_SHEET_WEBHOOK_URL) return;
  try {
    await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn("Audit log failed (Sheet sync):", err);
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [indents, setIndents] = useState([]);
  const [unitSettings, setUnitSettings] = useState(INITIAL_UNITS);
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('tracker');
  const [currentUnitFilter, setCurrentUnitFilter] = useState('SEMUA UNIT');
  const [entryUnit, setEntryUnit] = useState("");
  const [searchQuery, setSearchQuery] = useState('');
  
  const [showUnitSelector, setShowUnitSelector] = useState(false);
  const [showCollectorModal, setShowCollectorModal] = useState(null);
  const [collectorName, setCollectorName] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(null);
  const [tempNote, setTempNote] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', action: null });
  
  const [tempAppName, setTempAppName] = useState(appName);

  const [showEditUnitModal, setShowEditUnitModal] = useState(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitCats, setEditUnitCats] = useState('');

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Auth Lifecycle
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = getGlobal('__initial_auth_token');
        if (token) {
          await signInWithCustomToken(auth, token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    const indentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'indents');
    const unsubscribeIndents = onSnapshot(indentsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setIndents(data);
      setLoading(false);
    }, (err) => {
      console.error("Indents sync error:", err);
      setLoading(false);
    });

    const settingsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'units');
    const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUnitSettings(data);
        if (!entryUnit) setEntryUnit(Object.keys(data)[0]);
      } else {
        setDoc(settingsDocRef, INITIAL_UNITS);
        setUnitSettings(INITIAL_UNITS);
        setEntryUnit(Object.keys(INITIAL_UNITS)[0]);
      }
    });

    const appInfoRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'appInfo');
    const unsubscribeAppInfo = onSnapshot(appInfoRef, (docSnap) => {
      if (docSnap.exists()) {
        const name = docSnap.data().name || DEFAULT_APP_NAME;
        setAppName(name);
        setTempAppName(name);
      } else {
        setDoc(appInfoRef, { name: DEFAULT_APP_NAME });
        setAppName(DEFAULT_APP_NAME);
        setTempAppName(DEFAULT_APP_NAME);
      }
    });

    return () => {
      unsubscribeIndents();
      unsubscribeSettings();
      unsubscribeAppInfo();
    };
    // eslint-disable-next-line
  }, [user, entryUnit]);

  const handleAddIndent = async (e) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const now = new Date().toISOString();
    const newEntry = {
      unit: entryUnit,
      ward: formData.get('ward').toUpperCase(),
      staff: formData.get('staff').toUpperCase() || "TIADA NAMA",
      type: formData.get('type'),
      status: 'PENDING',
      created_at: now,
      done_at: null,
      collected_at: null,
      collected_by: null,
      note: ""
    };
    try {
      const indentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'indents');
      const docRef = await addDoc(indentsRef, newEntry);
      syncToGoogleSheets({ action: 'NEW_INDENT', id: docRef.id, ...newEntry });
      setActiveTab('tracker');
      e.target.reset();
    } catch (err) { console.error(err); }
  };

  const updateStatus = async (item, newStatus, collector = null, note = null) => {
    if (!user) return;
    const now = new Date().toISOString();
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'indents', item.id);
    const updates = { status: newStatus };
    if (newStatus === 'DONE') updates.done_at = now;
    if (newStatus === 'COLLECTED') {
      updates.collected_at = now;
      if (collector) updates.collected_by = collector;
    }
    if (note !== null) updates.note = note;
    try { 
      await updateDoc(docRef, updates); 
      syncToGoogleSheets({ 
        action: 'UPDATE_STATUS', 
        id: item.id, 
        unit: item.unit, 
        ward: item.ward, 
        type: item.type,
        old_status: item.status,
        new_status: newStatus,
        timestamp: now,
        collector: collector || item.collected_by,
        note: note || item.note
      });
    } catch (err) { console.error(err); }
  };

  const clearCollectedOnly = async () => {
    const batchPromises = indents.filter(i => i.status === 'COLLECTED')
      .map(i => {
        syncToGoogleSheets({ action: 'DELETE_LOG', id: i.id, ward: i.ward, status: 'COLLECTED_CLEARED' });
        return deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'indents', i.id));
      });
    await Promise.all(batchPromises);
    setConfirmDialog({ show: false });
  };

  const clearAllIndents = async () => {
    const batchPromises = indents.map(i => {
      syncToGoogleSheets({ action: 'DELETE_LOG', id: i.id, ward: i.ward, status: 'FORCE_CLEARED' });
      return deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'indents', i.id));
    });
    await Promise.all(batchPromises);
    setConfirmDialog({ show: false });
  };

  const saveUnitSettings = async (newSettings) => {
    const settingsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'units');
    await setDoc(settingsDocRef, newSettings);
  };

  const handleEditUnitSave = async () => {
    if (!editUnitName.trim() || !editUnitCats.trim()) return;
    const newSettings = { ...unitSettings };
    const oldName = showEditUnitModal;
    const newName = editUnitName.trim();
    if (oldName !== newName) delete newSettings[oldName];
    newSettings[newName] = editUnitCats.split(',').map(x => x.trim());
    await saveUnitSettings(newSettings);
    setShowEditUnitModal(null);
  };

  const saveAppName = async () => {
    if (!tempAppName.trim()) return;
    const appInfoRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'appInfo');
    await setDoc(appInfoRef, { name: tempAppName.trim() });
  };

  const handleSettingsClick = () => {
    if (activeTab === 'settings') return;
    setShowPasswordModal(true);
    setPasswordInput('');
    setPasswordError(false);
  };

  const verifyPassword = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setActiveTab('settings');
      setShowPasswordModal(false);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const filteredIndents = useMemo(() => {
    return indents
      .filter(i => {
        const matchesUnit = currentUnitFilter === 'SEMUA UNIT' || i.unit === currentUnitFilter;
        const matchesSearch = i.ward?.toString().toUpperCase().includes(searchQuery.toUpperCase()) || 
                             i.staff?.toString().toUpperCase().includes(searchQuery.toUpperCase());
        return matchesUnit && matchesSearch;
      })
      .sort((a, b) => {
        if (a.status === 'COLLECTED' && b.status !== 'COLLECTED') return 1;
        if (a.status !== 'COLLECTED' && b.status === 'COLLECTED') return -1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }, [indents, currentUnitFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Menyambung ke Awan...</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-slate-100 font-sans text-slate-800">
      <div className="w-full max-w-md h-[100dvh] bg-white shadow-2xl flex flex-col relative overflow-hidden md:h-[850px] md:rounded-[3rem] md:border-[8px] md:border-slate-800">
        
        <div className="absolute top-1 right-8 z-50">
          <div className="flex items-center gap-1 bg-white/80 backdrop-blur px-2 py-0.5 rounded-full border border-slate-100 shadow-sm">
            <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[8px] font-black uppercase text-slate-400">Live Cloud</span>
          </div>
        </div>

        <div className="p-4 border-b flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm">
          <div onClick={() => setShowUnitSelector(true)} className="flex items-center gap-3 cursor-pointer group">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg group-active:scale-90 transition-transform">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black text-blue-600 uppercase tracking-tighter leading-none mb-1 truncate max-w-[150px]">{appName}</p>
              <h1 className="text-sm font-black uppercase italic text-slate-800 flex items-center gap-1">
                {currentUnitFilter} <ChevronDown className="w-4 h-4 text-slate-400" />
              </h1>
            </div>
          </div>
        </div>

        {activeTab === 'tracker' && (
          <div className="px-4 py-3 bg-slate-50 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-xs font-bold outline-none uppercase shadow-sm focus:border-blue-500 transition-all" 
                placeholder="Cari Wad atau Nama Staf..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 scroll-smooth no-scrollbar">
          {activeTab === 'tracker' && (
            filteredIndents.length > 0 ? filteredIndents.map(item => (
              <div 
                key={item.id} 
                className={`bg-white p-4 rounded-2xl shadow-sm border-l-4 transition-all duration-300 transform
                  ${item.status === 'DONE' ? 'border-l-green-500 bg-green-50/30' : 
                    item.status === 'COLLECTED' ? 'border-l-slate-300 opacity-60 grayscale' : 'border-l-amber-500'}
                `}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-[8px] font-black uppercase tracking-tight ${getUnitColor(item.unit)}`}>{item.unit}</span>
                    <span className="text-[9px] font-black bg-blue-100 text-blue-600 px-2 py-0.5 rounded uppercase w-fit">{item.type}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setTempNote(item.note || ''); setShowNoteModal(item); }} className={`p-1 ${item.note ? 'text-red-500 animate-bounce' : 'text-slate-200'}`}>
                      <StickyNote className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => { 
                        if(item.status === 'PENDING') updateStatus(item, 'DONE'); 
                        else if(item.status === 'DONE') setShowCollectorModal(item); 
                      }} 
                      className={`text-[10px] font-black px-3 py-1 rounded-lg border uppercase italic transition-all active:scale-95 
                        ${item.status === 'DONE' ? 'bg-green-100 text-green-700 border-green-200 shadow-green-100' : 
                          item.status === 'COLLECTED' ? 'bg-slate-100 text-slate-500 border-slate-200' : 
                          'bg-amber-100 text-amber-700 border-amber-200 shadow-amber-100'}
                      `}
                    >
                      {item.status}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <h3 className={`text-xl font-black uppercase italic tracking-tighter leading-none ${getUnitColor(item.unit)}`}>{item.ward}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Staf: {item.staff}</p>
                  </div>
                  <div className="text-right flex flex-col gap-1">
                    <div className="flex items-center gap-1 justify-end text-slate-400 text-[9px] font-black uppercase tracking-tighter">
                      <Clock className="w-3 h-3" /> In: {formatDateTime(item.created_at)}
                    </div>
                    {item.done_at && (
                      <div className="flex items-center gap-1 justify-end text-green-600 text-[9px] font-black uppercase tracking-tighter">
                        <CheckCircle2 className="w-3 h-3" /> Ready: {formatDateTime(item.done_at)}
                      </div>
                    )}
                    {item.collected_at && (
                      <div className="flex items-center gap-1 justify-end text-slate-500 text-[9px] font-black uppercase tracking-tighter">
                        <User className="w-3 h-3" /> Out: {formatDateTime(item.collected_at)}
                      </div>
                    )}
                  </div>
                </div>
                {item.collected_by && (
                  <div className="mt-2 py-1 px-3 bg-slate-100 rounded-lg text-[10px] font-black text-slate-600 uppercase italic">
                    Diambil oleh: {item.collected_by}
                  </div>
                )}
                {item.note && (
                  <div className="mt-2 p-2 bg-red-100 rounded-xl border border-red-200 text-[10px] font-black text-red-700 uppercase italic leading-tight">
                    Nota: {item.note}
                  </div>
                )}
              </div>
            )) : (
              <div className="text-center py-20 opacity-20 flex flex-col items-center">
                <LayoutGrid className="w-16 h-16 mb-2" />
                <p className="font-black uppercase text-xs">Tiada Indent</p>
              </div>
            )
          )}

          {activeTab === 'entry' && (
            <div className="p-4 space-y-6">
              <h2 className="text-2xl font-black uppercase italic text-slate-800 tracking-tighter">Daftar Indent</h2>
              <form onSubmit={handleAddIndent} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Unit Pembekal</label>
                  <select value={entryUnit} onChange={(e) => setEntryUnit(e.target.value)} className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-black uppercase outline-none shadow-sm focus:ring-2 ring-blue-500/20">
                    {Object.keys(unitSettings).map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Wad / Unit Pemohon</label>
                   <input name="ward" required className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-black uppercase text-lg outline-none focus:border-blue-600 shadow-sm" placeholder="4A / ICUB" />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Kategori Ubat</label>
                   <select name="type" className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-black uppercase outline-none shadow-sm">
                     {(unitSettings[entryUnit] || []).map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nama Staf Wad</label>
                   <input name="staff" className="w-full bg-white border border-slate-200 p-4 rounded-2xl font-bold uppercase outline-none focus:border-blue-600 shadow-sm" placeholder="NAMA STAF" />
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all mt-4 hover:bg-blue-700">
                  Hantar Indent
                </button>
              </form>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="p-4 space-y-6 pb-10">
              <h2 className="text-2xl font-black uppercase italic text-slate-800 tracking-tighter">Tetapan Aplikasi</h2>
              <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                 <div className="flex items-center gap-2 mb-1">
                    <Edit3 className="w-4 h-4 text-blue-600" />
                    <h3 className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Nama Aplikasi</h3>
                 </div>
                 <div className="flex gap-2">
                    <input 
                      className="flex-1 bg-slate-50 border-none p-4 rounded-2xl font-bold uppercase text-xs outline-none focus:ring-2 ring-blue-500/20" 
                      value={tempAppName} 
                      onChange={(e) => setTempAppName(e.target.value)}
                      placeholder="NAMA APLIKASI"
                    />
                    <button onClick={saveAppName} className="bg-blue-600 text-white px-5 rounded-2xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-all">Simpan</button>
                 </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-widest">Senarai Unit</h3>
                {Object.keys(unitSettings).map(name => (
                  <div key={name} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black uppercase italic truncate ${getUnitColor(name)}`}>{name}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{unitSettings[name].join(', ')}</p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button onClick={() => { setShowEditUnitModal(name); setEditUnitName(name); setEditUnitCats(unitSettings[name].join(', ')); }} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => { if(Object.keys(unitSettings).length > 1) setConfirmDialog({ show: true, title: 'PADAM UNIT?', message: `Padam unit ${name}?`, action: () => { const n = {...unitSettings}; delete n[name]; saveUnitSettings(n); setConfirmDialog({ show: false }); } }); }} className="p-2 text-slate-200 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-blue-50 p-5 rounded-3xl border border-blue-100 space-y-3">
                <input id="newU" className="w-full p-3 rounded-xl border-none font-bold uppercase text-xs shadow-sm outline-none" placeholder="NAMA UNIT BARU" />
                <textarea id="newC" className="w-full p-3 rounded-xl border-none font-bold uppercase text-[10px] shadow-sm outline-none" placeholder="KATEGORI (ASINGKAN DENGAN KOMA)" rows="2" />
                <button onClick={() => { const u = document.getElementById('newU').value; const c = document.getElementById('newC').value; if(u && c) { saveUnitSettings({...unitSettings, [u]: c.split(',').map(x => x.trim())}); document.getElementById('newU').value = ''; document.getElementById('newC').value = ''; } }} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-[10px] shadow-lg active:scale-95 transition-transform">Tambah Unit</button>
              </div>
            </div>
          )}
        </div>

        <div className="h-20 bg-white border-t flex justify-around items-center px-6 pb-6 sticky bottom-0 z-10">
          <button onClick={() => setActiveTab('tracker')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'tracker' ? 'text-blue-600 scale-110 font-black' : 'text-slate-300'}`}>
            <LayoutGrid className="w-6 h-6" /><span className="text-[9px] font-black uppercase">STATUS</span>
          </button>
          <button onClick={() => setActiveTab('entry')} className="bg-blue-600 text-white p-4 rounded-2xl shadow-xl -mt-10 active:scale-90 border-4 border-white"><Plus className="w-6 h-6" /></button>
          <button onClick={handleSettingsClick} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-blue-600 scale-110 font-black' : 'text-slate-300'}`}>
            <Settings className="w-6 h-6" /><span className="text-[9px] font-black uppercase">SETTING</span>
          </button>
        </div>

        {/* MODALS */}
        {showPasswordModal && (
          <div className="absolute inset-0 bg-slate-900/60 z-[300] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full max-w-[300px] rounded-[2.5rem] p-8 shadow-2xl border-t-8 border-blue-600">
              <div className="flex justify-center mb-6 text-blue-600 bg-blue-50 w-16 h-16 rounded-full items-center mx-auto"><Lock className="w-8 h-8" /></div>
              <input type="password" autoFocus className={`w-full p-4 bg-slate-50 rounded-2xl font-bold text-center outline-none focus:ring-2 mb-6 ${passwordError ? 'ring-red-500' : 'focus:ring-blue-500/20'}`} placeholder="Kata Laluan" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }} onKeyDown={(e) => e.key === 'Enter' && verifyPassword()} />
              <div className="flex gap-3">
                <button onClick={() => setShowPasswordModal(false)} className="flex-1 font-black text-slate-300 uppercase text-[10px] py-4">Batal</button>
                <button onClick={verifyPassword} className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg">Sahkan</button>
              </div>
            </div>
          </div>
        )}

        {showEditUnitModal && (
          <div className="absolute inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl border-t-8 border-blue-600">
              <input className="w-full bg-slate-50 border-none p-4 rounded-2xl font-bold uppercase text-xs mb-4" value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)} placeholder="Nama Unit" />
              <textarea rows="3" className="w-full bg-slate-50 border-none p-4 rounded-2xl font-bold uppercase text-xs mb-6" value={editUnitCats} onChange={(e) => setEditUnitCats(e.target.value)} placeholder="Kategori" />
              <div className="flex gap-3">
                <button onClick={() => setShowEditUnitModal(null)} className="flex-1 font-black text-slate-300 uppercase text-[10px] py-4">Batal</button>
                <button onClick={handleEditUnitSave} className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px]">Simpan</button>
              </div>
            </div>
          </div>
        )}

        {showUnitSelector && (
          <div className="absolute inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-6 shadow-2xl">
              <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
                <button onClick={() => { setCurrentUnitFilter('SEMUA UNIT'); setShowUnitSelector(false); }} className={`col-span-2 p-4 rounded-2xl font-black uppercase text-[10px] ${currentUnitFilter === 'SEMUA UNIT' ? 'bg-blue-600 text-white' : 'bg-slate-50'}`}>Tunjukkan Semua Unit</button>
                {Object.keys(unitSettings).map(u => (
                  <button key={u} onClick={() => { setCurrentUnitFilter(u); setShowUnitSelector(false); }} className={`p-4 rounded-2xl font-black uppercase text-[10px] ${currentUnitFilter === u ? 'bg-blue-600 text-white' : 'bg-white border'}`}>{u}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showCollectorModal && (
          <div className="absolute inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full rounded-3xl p-6 shadow-2xl">
              <input autoFocus className="w-full p-4 bg-slate-50 border rounded-xl font-black uppercase mb-4" placeholder="NAMA STAF PENGAMBIL" value={collectorName} onChange={(e) => setCollectorName(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => setShowCollectorModal(null)} className="flex-1 font-black text-slate-300 text-[10px]">Batal</button>
                <button onClick={() => { if(!collectorName) return; updateStatus(showCollectorModal, 'COLLECTED', collectorName.toUpperCase()); setShowCollectorModal(null); setCollectorName(''); }} className="flex-[2] bg-purple-600 text-white py-3 rounded-xl font-black text-[10px]">Sahkan</button>
              </div>
            </div>
          </div>
        )}

        {showNoteModal && (
          <div className="absolute inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full rounded-3xl p-6 shadow-2xl">
              <textarea rows="3" autoFocus className="w-full p-4 bg-red-50 border border-red-100 rounded-xl font-bold uppercase mb-4 text-sm" value={tempNote} onChange={(e) => setTempNote(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => setShowNoteModal(null)} className="flex-1 font-black text-slate-300 text-[10px]">Batal</button>
                <button onClick={() => { updateStatus(showNoteModal, showNoteModal.status, null, tempNote.toUpperCase()); setShowNoteModal(null); setTempNote(''); }} className="flex-[2] bg-red-600 text-white py-3 rounded-xl font-black text-[10px]">Simpan</button>
              </div>
            </div>
          </div>
        )}

        {confirmDialog.show && (
          <div className="absolute inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm">
            <div className="bg-white w-full max-w-[300px] rounded-[2.5rem] p-8 shadow-2xl">
              <h3 className="font-black uppercase text-center text-lg mb-2 italic">{confirmDialog.title}</h3>
              <p className="text-[11px] font-bold text-slate-400 text-center uppercase mb-8">{confirmDialog.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDialog({ show: false })} className="flex-1 font-black text-slate-300 text-[10px] py-4 bg-slate-50 rounded-2xl">Batal</button>
                <button onClick={confirmDialog.action} className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] shadow-lg">Sahkan</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
