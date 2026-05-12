import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, CheckSquare, Timer, BarChart3, Settings, Bell, 
  Search, Plus, MoreVertical, Play, Pause, RotateCcw, Coffee, 
  BrainCircuit, Flame, CheckCircle2, Circle, Clock, CalendarDays,
  ChevronRight, Award, Trash2, GripHorizontal, X, ArrowLeft, Quote,
  ChevronDown, Calendar, ChevronLeft, Pencil, Menu, Sparkles, Send, Bot, Sparkle, FolderOpen, Link2, Library, ExternalLink, Hash, Globe, Image as ImageIcon, Camera,
  Users, LogOut, MessageSquare, Share2, Code, User as UserIcon, FileQuestion, Info
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  doc, setDoc, getDoc, updateDoc, collection, onSnapshot, 
  query, where, orderBy, addDoc, arrayUnion, arrayRemove, serverTimestamp,
  Timestamp, getDocs, deleteDoc, runTransaction
} from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout } from './firebase';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Custom CSS untuk Animasi & Scrollbar ---
const customStyles = `
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(15px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 15px rgba(139, 92, 246, 0.2); }
    50% { box-shadow: 0 0 25px rgba(139, 92, 246, 0.5); }
  }
  .animate-fade-slide { animation: fadeSlideUp 0.4s ease-out forwards; }
  .animate-glow { animation: pulseGlow 2s infinite; }
  
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6366f1; }
  
  .text-gradient {
    background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
`;

// Kutipan Motivasi Pelajar
const motivations = [
  "Barangsiapa tidak mau merasakan pahitnya belajar, ia akan merasakan hinanya kebodohan sepanjang hidupnya. - Imam Syafi'i",
  "Pendidikan adalah senjata paling ampuh yang bisa Anda gunakan untuk mengubah dunia. - Nelson Mandela",
  "Masa depan adalah milik mereka yang menyiapkan hari ini. - Malcolm X",
  "Jangan berharap pekerjaanmu menjadi lebih mudah, berharaplah kamu menjadi lebih baik. - Jim Rohn"
];

export default function App() {
  // --- FIREBASE AUTH & USER STATE ---
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [registrationMode, setRegistrationMode] = useState(false);
  const [tempName, setTempName] = useState('');

  // STATE NAVIGASI
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isTasksMenuOpen, setIsTasksMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  
  // AI ASSISTANT STATE
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // STATE APLIKASI
  const [tasks, setTasks] = useState<any[]>([]);
  const [resources, setResources] = useState(() => {
    const saved = localStorage.getItem('ruangfokus_resources');
    return saved ? JSON.parse(saved) : [];
  });

  const [totalFocusTime, setTotalFocusTime] = useState(() => {
    const saved = localStorage.getItem('ruangfokus_time');
    return saved ? Number(saved) : 0;
  });

  const [weeklyFocus, setWeeklyFocus] = useState(() => {
    const saved = localStorage.getItem('ruangfokus_weekly');
    return saved ? JSON.parse(saved) : [0, 0, 0, 0, 0, 0, 0];
  });

  const [chatSessions, setChatSessions] = useState(() => {
    const saved = localStorage.getItem('ruangfokus_ai_sessions');
    if (saved) return JSON.parse(saved);
    return [{
      id: 'default',
      title: 'Chat Baru',
      messages: [{ role: 'assistant', content: 'Halo! Saya asisten AI RuangFokus. Ada yang bisa saya bantu dengan pelajaran atau tugasmu hari ini?' }]
    }];
  });

  const [activeSessionId, setActiveSessionId] = useState('default');
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const lastLocalAction = useRef(0);

  const [quote] = useState(motivations[Math.floor(Math.random() * motivations.length)]);

  // STATE POMODORO (Diangkat ke tingkat atas agar berjalan di background)
  const [inputFocus, setInputFocus] = useState(25);
  const [inputBreak, setInputBreak] = useState(5);
  const [isSetupMode, setIsSetupMode] = useState(true);
  const [pomodoroMode, setPomodoroMode] = useState('focus'); // focus atau break
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const streak = (totalFocusTime > 0 || tasks.some(t => t.status === 'done')) ? 1 : 0;

  useEffect(() => {
    if (!currentUser || registrationMode) return;
    
    // Use a try-catch for the query to ensure we handle potential index issues or permission errors gracefully
    try {
      const tasksQuery = query(
        collection(db, 'users', currentUser.uid, 'tasks'),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const tasksData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTasks(tasksData);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/tasks`);
      });
      
      return () => unsubscribe();
    } catch (err) {
      console.error("Query setup error:", err);
    }
  }, [currentUser, registrationMode]);

  useEffect(() => { localStorage.setItem('ruangfokus_resources', JSON.stringify(resources)); }, [resources]);
  useEffect(() => { localStorage.setItem('ruangfokus_time', totalFocusTime.toString()); }, [totalFocusTime]);
  useEffect(() => { localStorage.setItem('ruangfokus_weekly', JSON.stringify(weeklyFocus)); }, [weeklyFocus]);
  useEffect(() => { localStorage.setItem('ruangfokus_ai_sessions', JSON.stringify(chatSessions)); }, [chatSessions]);

  // --- FIREBASE AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUserProfile(userSnap.data());
          setRegistrationMode(false);
        } else {
          // User exists in Auth but not in Firestore -> Needs registration
          setRegistrationMode(true);
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [syncTrigger, setSyncTrigger] = useState(0);

  // --- SYNC USER DATA TO FIREBASE (REAL-TIME STATUS) ---
  useEffect(() => {
    if (!currentUser || registrationMode) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const syncData = {
      displayName: userProfile?.displayName || currentUser.displayName || 'Pelajar',
      photoURL: currentUser.photoURL || null,
      currentStreak: streak,
      totalFocusTime: totalFocusTime,
      weeklyFocus: weeklyFocus,
      lastSeen: serverTimestamp(),
      currentTimer: {
        isRunning,
        timeLeft,
        targetTime: targetTime || null,
        mode: pomodoroMode,
        lastUpdated: serverTimestamp()
      }
    };

    // If syncTrigger was bumped, we do it immediately
    if (syncTrigger > 0) {
      setDoc(userRef, syncData, { merge: true }).catch(err => console.error("Sync Error:", err));
    }

    const timeout = setTimeout(async () => {
      try {
        await setDoc(userRef, syncData, { merge: true });
      } catch (err) {
        console.error("Sync Error:", err);
      }
    }, 5000); // 5 seconds debounce for general state

    return () => clearTimeout(timeout);
  }, [currentUser, registrationMode, streak, totalFocusTime, weeklyFocus, isRunning, pomodoroMode, targetTime, syncTrigger]);

  // --- LISTEN TO OWN USER PROFILE & SYNC REMOTE TIMER ---
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setUserProfile(data);

        // Sync remote timer if we are not actively running a local one
        if (data.currentTimer) {
          const remote = data.currentTimer;
          const now = Date.now();
          
          // Only sync if remote is newer than our last local action
          const remoteUpdateTime = remote.lastUpdated?.toMillis() || 0;
          if (remoteUpdateTime > lastLocalAction.current) {
            // If remote is running, sync targetTime and status
            if (remote.isRunning) {
              if (!isRunning || Math.abs(remote.targetTime - (targetTime || 0)) > 2000 || remote.mode !== pomodoroMode) {
                setTargetTime(remote.targetTime);
                setPomodoroMode(remote.mode);
                setIsRunning(true);
                setIsSetupMode(false);
              }
            } else if (isRunning) {
              // Remote stopped, so we stop
              setIsRunning(false);
            }
          }
        }
      }
    }, (err) => {
      console.error("User profile listener error:", err);
    });
    return () => unsubscribe();
  }, [currentUser, isRunning]); // Re-subscribe if isRunning changes to handle sync logic correctly

  // --- REGISTRATION HANDLER ---
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !tempName.trim()) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const profile = {
      displayName: tempName.trim(),
      photoURL: currentUser.photoURL,
      currentStreak: streak,
      totalFocusTime: totalFocusTime,
      weeklyFocus: weeklyFocus,
      createdAt: serverTimestamp()
    };

    await setDoc(userRef, profile);
    setUserProfile(profile);
    setRegistrationMode(false);
  };

  // LISTENER UNTUK PERUBAHAN TAB DARI KOMPONEN LAIN
  useEffect(() => {
    const handleTabChange = (e: any) => {
      if (e.detail) {
        setActiveTab(e.detail);
        setIsTasksMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('changeTab', handleTabChange);
    return () => window.removeEventListener('changeTab', handleTabChange);
  }, []);

  // LOGIKA PENCARIAN
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const query = searchQuery.toLowerCase();
    const foundTask = tasks.find((t: any) => t.title.toLowerCase().includes(query));

    if (foundTask) {
      setActiveTab('tasks-kanban');
      setIsTasksMenuOpen(true);
      setHighlightedTaskId(foundTask.id);
      // Reset highlight after 3 seconds
      setTimeout(() => setHighlightedTaskId(null), 3000);
    } else {
      alert(`Tugas "${searchQuery}" tidak ditemukan.`);
    }
  };

  // LOGIKA GLOBAL TIMER POMODORO
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
       if (targetTime) {
         const now = Date.now();
         const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
         setTimeLeft(remaining);
         
         // End session logic here instead of separate effect if possible, but let's keep it separate for now
       } else {
         setTimeLeft(prev => prev - 1);
       }
       
       // Catat Statistik
       if (pomodoroMode === 'focus') {
          setTotalFocusTime(prev => prev + 1);
          setWeeklyFocus(prev => {
             const newW = [...prev];
             const day = new Date().getDay();
             const idx = day === 0 ? 6 : day - 1; // 0 = Minggu -> ke index 6
             newW[idx] += 1;
             return newW;
          });
       }
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, pomodoroMode, targetTime]);

  // Pantau waktu habis
  useEffect(() => {
     if (timeLeft === 0 && !isSetupMode && isRunning) {
         lastLocalAction.current = Date.now();
         if (pomodoroMode === 'focus') {
             alert("🔔 Waktu fokus selesai! Bagus sekali, ayo istirahat sebentar.");
             const duration = inputBreak * 60;
             setPomodoroMode('break');
             setTimeLeft(duration);
             setTargetTime(Date.now() + (duration * 1000));
         } else {
             alert("🔔 Waktu istirahat selesai! Siap kembali fokus?");
             const duration = inputFocus * 60;
             setPomodoroMode('focus');
             setTimeLeft(duration);
             setTargetTime(Date.now() + (duration * 1000));
         }
     }
  }, [timeLeft, isSetupMode, isRunning, pomodoroMode, inputBreak, inputFocus]);

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full bg-[#09090b] flex flex-col items-center justify-center text-white font-sans">
        <BrainCircuit size={64} className="text-indigo-500 animate-pulse mb-6" />
        <div className="flex gap-2 mb-2">
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
        </div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Menyiapkan Ruang Fokus...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center p-4 sm:p-6 md:p-10 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
        {/* Deep background gradients for atmosphere */}
        <div className="absolute top-[-20%] left-[-10%] w-[100vw] sm:w-[60vw] h-[60vw] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[100vw] sm:w-[50vw] h-[50vw] bg-emerald-600/10 rounded-full blur-[100px] animate-pulse [animation-delay:2s]"></div>
        
        <div className="w-full max-w-5xl bg-[#121214]/40 backdrop-blur-3xl rounded-[2rem] sm:rounded-[3rem] border border-white/5 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col md:flex-row min-h-fit animate-fade-slide relative z-10">
          
          {/* LEFT SECTION: LOGIN & WELCOME */}
          <div className="flex-1 p-8 sm:p-12 lg:p-20 flex flex-col justify-center">
             <div className="flex items-center gap-3 mb-10 sm:mb-16 justify-center md:justify-start">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-transform hover:scale-105">
                  <BrainCircuit size={24} className="sm:hidden" />
                  <BrainCircuit size={28} className="hidden sm:block" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-white uppercase">Focus <span className="text-indigo-500">Flow</span></h1>
             </div>

             <div className="max-w-md w-full mx-auto md:mx-0 text-center md:text-left">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4 tracking-tighter leading-[1.1]">Smarter Study,<br className="hidden sm:block" /> Better Results.</h2>
                <p className="text-gray-400 font-medium mb-10 sm:mb-14 leading-relaxed opacity-70 text-sm sm:text-base">
                  Masuk ke ruang belajarmu yang terukur dan kolaboratif. Tingkatkan fokusmu hari ini.
                </p>

                <div className="space-y-6">
                   <button 
                     onClick={signInWithGoogle}
                     className="w-full bg-white hover:bg-gray-100 text-black h-14 sm:h-16 rounded-2xl font-black flex items-center justify-center gap-4 transition-all active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.05)] group/btn"
                   >
                     <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover/btn:scale-110" />
                     <span className="text-sm sm:text-base">MASUK DENGAN GOOGLE</span>
                   </button>

                   <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className="w-6 h-6 rounded-lg border-2 border-white/10 group-hover:border-indigo-500 transition-all bg-[#09090b] flex items-center justify-center">
                           <div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest group-hover:text-gray-200 transition-colors">Ingat Saya</span>
                      </label>
                      
                      <div className="flex items-center gap-2 py-1 px-3 bg-emerald-500/5 border border-emerald-500/10 rounded-full">
                         <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                         <span className="text-[9px] font-black text-emerald-500/80 uppercase tracking-widest">Sistem Siap</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* RIGHT SECTION: BRAND & AURA (Hidden on small mobile if needed, but kept as a sleek sidepanel here) */}
          <div className="hidden md:flex w-[40%] lg:w-[45%] bg-gradient-to-br from-white/[0.03] to-transparent p-12 lg:p-20 flex-col justify-center relative overflow-hidden border-l border-white/[0.05]">
             <div className="absolute inset-0 bg-[#0a0a0c]"></div>
             
             <div className="relative z-10 text-center space-y-12">
                <div className="relative group">
                   <div className="absolute inset-0 bg-indigo-600/20 blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                   <div className="w-48 h-48 lg:w-64 lg:h-64 bg-[#121214] backdrop-blur-2xl rounded-[3rem] sm:rounded-[4rem] border border-white/10 mx-auto flex items-center justify-center shadow-2xl relative transition-transform duration-700 group-hover:scale-105 group-hover:rotate-1">
                      <BrainCircuit size={80} className="text-indigo-400 drop-shadow-[0_0_20px_rgba(129,140,248,0.3)] lg:hidden" />
                      <BrainCircuit size={110} className="text-indigo-400 drop-shadow-[0_0_30px_rgba(129,140,248,0.4)] hidden lg:block" />
                      
                      {/* Floating Accent Tiles */}
                      <div className="absolute -top-4 -right-4 w-16 h-16 lg:w-20 lg:h-20 bg-indigo-500/10 backdrop-blur-xl rounded-2xl lg:rounded-3xl flex items-center justify-center border border-white/10 animate-bounce [animation-duration:8s]">
                        <Sparkles size={24} className="text-indigo-300 lg:hidden" />
                        <Sparkles size={32} className="text-indigo-300 hidden lg:block" />
                      </div>
                      <div className="absolute -bottom-6 -left-6 w-14 h-14 lg:w-18 lg:h-18 bg-white/5 backdrop-blur-xl rounded-2xl lg:rounded-[1.5rem] flex items-center justify-center border border-white/5 animate-bounce [animation-duration:6s] [animation-delay:1s]">
                        <Timer size={20} className="text-gray-400 lg:hidden" />
                        <Timer size={28} className="text-gray-400 hidden lg:block" />
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.5em] opacity-80">productivity redefined</p>
                   <h3 className="text-2xl lg:text-3xl font-black text-white tracking-tighter leading-tight drop-shadow-lg">Optimalkan Cara Belajarmu.</h3>
                   <div className="w-10 h-1 bg-indigo-600 rounded-full mx-auto mt-6 opacity-60"></div>
                </div>
             </div>
             
             {/* Subtle aesthetic pattern */}
             <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center opacity-30 px-6">
           <p className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-[0.4em] text-center">&copy; 2024 FOCUS FLOW &bull; SMARTER STUDYING &bull; SECURE CLOUD SYNC</p>
        </div>
      </div>
    );
  }

  if (registrationMode) {
    return (
      <div className="h-screen w-full bg-[#09090b] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="max-w-md w-full bg-[#121214] border border-[#27272a] rounded-[2.5rem] p-10 shadow-2xl relative z-10 animate-fade-slide">
           <form onSubmit={handleRegister} className="space-y-8">
              <div className="text-center">
                 <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-6 text-indigo-400">
                   <UserIcon size={32} />
                 </div>
                 <h2 className="text-2xl font-black text-white mb-2">Hampir Selesai!</h2>
                 <p className="text-sm text-gray-400">Tampilan profilmu di RuangFokus akan menggunakan nama ini.</p>
              </div>

              <div className="space-y-4">
                 <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Siapa namamu?</label>
                    <input 
                      autoFocus
                      required
                      type="text" 
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="Masukkan nama lengkapmu"
                      className="w-full bg-[#18181b] border border-[#27272a] rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                 </div>
                 <button 
                   type="submit"
                   className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-900/40 active:scale-95"
                 >
                   Mulai Petualangan Belajar
                 </button>
              </div>
           </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: customStyles}} />
      <div className="flex h-screen w-full bg-[#09090b] text-gray-200 font-sans overflow-hidden selection:bg-indigo-500/30">
        
        {/* OVERLAY FOR MOBILE SIDEBAR */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* SIDEBAR NAVIGATION */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 w-72 md:w-80 bg-[#09090b] border-r border-white/[0.03] 
          flex flex-col shrink-0 z-50 transition-all duration-500 ease-in-out lg:translate-x-0
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          shadow-[50px_0_100px_-50px_rgba(0,0,0,0.5)]
        `}>
          <div className="flex flex-col h-full">
            <div className="p-8 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 cursor-pointer group" onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}>
                <div className="w-12 h-12 rounded-[1.2rem] bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-[0_15px_30px_-5px_rgba(79,70,229,0.6)] group-hover:scale-110 transition-all duration-500 group-hover:rotate-6">
                  <BrainCircuit size={28} className="text-white" />
                </div>
                <div>
                   <h1 className="text-2xl font-black tracking-tighter text-white leading-none">Ruang<span className="text-indigo-400">Fokus</span></h1>
                   <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] mt-1">Study Companion</p>
                </div>
              </div>
              <button className="lg:hidden p-3 text-gray-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all" onClick={() => setIsMobileMenuOpen(false)}>
                 <X size={24} />
              </button>
            </div>

            {/* Profile Section - Enhanced */}
            <div className="bg-[#121214]/60 backdrop-blur-xl p-5 rounded-[2rem] border border-white/5 flex flex-col gap-4 group relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all"></div>
               <div className="flex items-center gap-4 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 p-0.5 shadow-lg group-hover:scale-105 transition-transform duration-500">
                     <img src={userProfile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.uid}`} alt="Profile" className="w-full h-full rounded-[0.9rem] bg-[#121214] object-cover" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                     <p className="text-sm font-black text-white truncate leading-tight group-hover:text-indigo-300 transition-colors">{userProfile?.displayName || 'Pelajar'}</p>
                     <p className="text-[10px] font-bold text-gray-500 truncate opacity-60 tracking-tight">{currentUser?.email || 'Siswa Berprestasi'}</p>
                  </div>
               </div>
               <button 
                 onClick={async (e) => {
                   e.preventDefault();
                   try {
                     await logout();
                   } catch (err) {
                     alert("Gagal keluar: " + (err instanceof Error ? err.message : String(err)));
                   }
                 }}
                 className="w-full py-3 rounded-2xl border border-white/5 text-gray-500 hover:bg-rose-500 hover:text-white hover:border-rose-400 flex items-center justify-center gap-2 transition-all font-black text-[10px] uppercase tracking-[0.2em] relative z-10 group/logout"
                 title="Logout"
               >
                 <LogOut size={14} className="group-hover/logout:-translate-x-0.5 transition-transform" />
                 <span>Keluar</span>
               </button>
            </div>
          </div>

            <nav className="flex-1 px-5 pb-8 space-y-2 overflow-y-auto custom-scrollbar">
              <div className="text-[9px] font-black text-gray-600 uppercase tracking-[0.4em] mb-4 ml-4">Navigasi Utama</div>
              <NavItem icon={<LayoutDashboard/>} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => {setActiveTab('dashboard'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
              
              {/* Menu Tugas dengan Submenu */}
              <div>
              <NavItem 
                icon={<CheckSquare/>} label="Tugas & PR" 
                active={activeTab.startsWith('tasks')} 
                onClick={() => setIsTasksMenuOpen(!isTasksMenuOpen)} 
                badge={tasks.filter(t=>t.status !== 'done').length} 
                hasSubmenu={true} isOpen={isTasksMenuOpen}
              />
                 
                 {/* Submenu Dropdown */}
                 {isTasksMenuOpen && (
                    <div className="pl-12 pr-4 mt-3 space-y-2 animate-fade-slide border-l-2 border-white/[0.03] ml-8">
                       <div onClick={() => { setActiveTab('tasks-kanban'); setIsMobileMenuOpen(false); }} className={`cursor-pointer px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest ${activeTab === 'tasks-kanban' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-gray-500 hover:bg-white/[0.03] hover:text-white'}`}>
                          Papan Kanban
                       </div>
                       <div onClick={() => { setActiveTab('tasks-calendar'); setIsMobileMenuOpen(false); }} className={`cursor-pointer px-4 py-3 rounded-xl text-xs font-black transition-all flex items-center gap-2 uppercase tracking-widest ${activeTab === 'tasks-calendar' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20' : 'text-gray-500 hover:bg-white/[0.03] hover:text-white'}`}>
                          Kalender
                       </div>
                    </div>
                 )}
              </div>

              <NavItem icon={<Timer/>} label="Pomodoro" active={activeTab === 'pomodoro'} onClick={() => {setActiveTab('pomodoro'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
              <NavItem icon={<Library />} label="Materi" active={activeTab === 'resources'} onClick={() => {setActiveTab('resources'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
              <NavItem icon={<Users />} label="Grup Belajar" active={activeTab === 'study-group'} onClick={() => {setActiveTab('study-group'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
              <NavItem icon={<FileQuestion />} label="AI Auto Quiz" active={activeTab === 'ai-quiz'} onClick={() => {setActiveTab('ai-quiz'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
              <NavItem icon={<Sparkles />} label="Asisten AI" active={activeTab === 'ai-assistant'} onClick={() => {setActiveTab('ai-assistant'); setIsTasksMenuOpen(false); setIsMobileMenuOpen(false);}} />
            </nav>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col relative overflow-y-auto custom-scrollbar">
          
          {/* HEADER DENGAN GLOBAL MINI-TIMER */}
          <header className="h-24 px-6 md:px-10 lg:px-12 flex items-center justify-between shrink-0 backdrop-blur-3xl bg-[#09090b]/80 z-30 border-b border-white/[0.03] sticky top-0 transition-all duration-500">
             <div className="flex items-center gap-6">
                <button 
                  className="lg:hidden p-3 text-gray-500 hover:text-white hover:bg-white/5 rounded-2xl transition-all shadow-xl active:scale-90"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <Menu size={28} />
                </button>
                <div className="flex flex-col">
                    <h2 className="text-xl md:text-2xl font-black text-white capitalize tracking-tighter line-clamp-1">
                      {activeTab === 'pomodoro' ? 'Fokus Timer' : activeTab === 'tasks-kanban' ? 'Papan Tugas' : activeTab === 'tasks-calendar' ? 'Jadwal' : activeTab === 'ai-quiz' ? 'AI Quiz' : activeTab.replace('-', ' ')}
                    </h2>
                    <div className="flex items-center gap-2 text-[10px] md:text-[11px] text-gray-500 font-black uppercase tracking-[0.2em] opacity-60">
                       <CalendarDays size={12} className="text-indigo-500"/> {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                </div>
             </div>
             <div className="flex items-center gap-3 md:gap-6">
                
                {/* GLOBAL MINI-TIMER (Muncul jika Pomodoro sudah diset) */}
                {!isSetupMode && activeTab !== 'pomodoro' && (
                   <div 
                     onClick={() => setActiveTab('pomodoro')}
                     className="flex items-center gap-2 md:gap-3 bg-indigo-600/10 backdrop-blur-xl border border-indigo-500/30 px-4 md:px-6 py-2 md:py-2.5 rounded-full text-indigo-400 text-[11px] md:text-xs font-black cursor-pointer hover:bg-indigo-600/20 hover:border-indigo-500/50 transition-all shadow-2xl group/mini"
                   >
                     {isRunning ? <Timer size={14} className="animate-pulse text-indigo-400" /> : <Pause size={14} className="text-amber-500" />}
                     <span className="tabular-nums font-black">{Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{ (timeLeft % 60).toString().padStart(2, '0') }</span>
                     <span className="hidden sm:inline opacity-40 ml-1 text-[10px] uppercase tracking-widest border-l border-white/10 pl-3 group-hover/mini:text-indigo-300">{pomodoroMode === 'focus' ? 'Fokus' : 'Break'}</span>
                   </div>
                )}

                <form onSubmit={handleSearch} className="hidden xl:flex bg-white/[0.03] border border-white/5 rounded-2xl px-5 py-2.5 items-center gap-3 w-64 lg:w-80 focus-within:border-indigo-500/50 focus-within:bg-white/[0.05] transition-all group/search shadow-inner">
                   <Search size={18} className="text-gray-600 group-focus-within/search:text-indigo-400 transition-colors" />
                   <input 
                      type="text" 
                      placeholder="Cari sesuatu..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-gray-600 font-bold" 
                   />
                </form>
                
                <div className="relative">
                   <button 
                      onClick={() => setShowNotifications(!showNotifications)}
                      className={`relative w-11 h-11 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center text-gray-500 hover:text-white hover:border-indigo-500 transition-all active:scale-90 shadow-lg ${showNotifications ? 'border-indigo-500 text-indigo-400 bg-indigo-600/10' : ''}`}
                   >
                      <Bell size={22} />
                      {tasks.filter(t => t.status !== 'done').length > 0 && (
                         <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-rose-500 rounded-full border-[3px] border-[#09090b] shadow-lg animate-pulse"></span>
                      )}
                   </button>

                   {/* POPUP NOTIFIKASI */}
                   {showNotifications && (
                      <div className="absolute right-0 mt-3 w-72 md:w-80 bg-[#121214] border border-[#27272a] rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-slide">
                         <div className="p-4 border-b border-[#27272a] bg-[#18181b] flex justify-between items-center">
                            <h3 className="font-bold text-sm text-white">Notifikasi Tugas</h3>
                            <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-bold">
                               {tasks.filter(t => t.status !== 'done').length} AKTIF
                            </span>
                         </div>
                         <div className="max-h-80 overflow-y-auto custom-scrollbar">
                            {tasks.filter(t => t.status !== 'done').length > 0 ? (
                               tasks.filter(t => t.status !== 'done').map(task => (
                                  <div key={task.id} className="p-4 hover:bg-[#18181b] border-b border-[#27272a]/50 transition-colors cursor-pointer group">
                                     <div className="flex items-start gap-3">
                                        <div className="w-2 h-2 mt-1.5 rounded-full bg-indigo-500 group-hover:scale-125 transition-transform"></div>
                                        <div>
                                           <p className="text-sm font-semibold text-gray-200 mb-1">{task.title}</p>
                                           <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                              <Clock size={10}/> Deadline: {task.dueDate || 'Hari ini'}
                                           </p>
                                        </div>
                                     </div>
                                  </div>
                               ))
                            ) : (
                               <div className="p-8 text-center">
                                  <CheckCircle2 size={32} className="text-emerald-500/50 mx-auto mb-3" />
                                  <p className="text-sm font-medium text-gray-500">Semua tugas sudah beres!</p>
                               </div>
                            )}
                         </div>
                         <div className="p-3 bg-[#18181b] border-t border-[#27272a] text-center">
                            <button 
                               onClick={() => { setActiveTab('tasks-kanban'); setShowNotifications(false); }}
                               className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest"
                            >
                               Buka Papan Tugas
                            </button>
                         </div>
                      </div>
                   )}
                </div>
             </div>
          </header>

          {/* CONTENT RENDERER */}
          <div className={`flex-1 overflow-y-auto custom-scrollbar relative flex flex-col ${
            ['ai-assistant', 'study-group', 'ai-quiz'].includes(activeTab) ? 'p-0 overflow-hidden' : 'p-5 md:p-8'
          }`}>
             {activeTab === 'dashboard' && <DashboardView tasks={tasks} totalFocusTime={totalFocusTime} streak={streak} quote={quote} onGoTasks={()=>{setActiveTab('tasks-kanban'); setIsTasksMenuOpen(true);}} onGoAi={() => {setActiveTab('ai-assistant'); setIsTasksMenuOpen(false);}} />}
             
             {/* Views Tugas */}
             {activeTab === 'tasks-kanban' && <TasksView tasks={tasks} setTasks={setTasks} highlightedTaskId={highlightedTaskId} currentUser={currentUser} />}
             {activeTab === 'tasks-calendar' && <CalendarView tasks={tasks} />}
             
             {/* Pomodoro */}
             {activeTab === 'pomodoro' && (
                <PomodoroView 
                   inputFocus={inputFocus} setInputFocus={setInputFocus}
                   inputBreak={inputBreak} setInputBreak={setInputBreak}
                   isSetupMode={isSetupMode} setIsSetupMode={setIsSetupMode}
                   mode={pomodoroMode} setMode={setPomodoroMode}
                   timeLeft={timeLeft} setTimeLeft={setTimeLeft}
                   isRunning={isRunning} setIsRunning={setIsRunning}
                   targetTime={targetTime} setTargetTime={setTargetTime}
                   lastLocalAction={lastLocalAction}
                   setSyncTrigger={setSyncTrigger}
                />
             )}
             
             {/* Statistik */}
 
             {/* Study Group */}
             {activeTab === 'study-group' && (
                <StudyGroupView currentUser={currentUser} userProfile={userProfile} />
             )}

             {/* AI Assistant */}
             {activeTab === 'ai-assistant' && (
                <AIAssistantView 
                  sessions={chatSessions} 
                  setSessions={setChatSessions}
                  activeSessionId={activeSessionId}
                  setActiveSessionId={setActiveSessionId}
                  isLoading={isAiLoading} 
                  setIsLoading={setIsAiLoading} 
                  tasks={tasks}
                />
             )}

             {/* AI Auto Quiz */}
             {activeTab === 'ai-quiz' && (
                <AiQuizView currentUser={currentUser} />
             )}

             {/* Resources View */}
             {activeTab === 'resources' && (
                <ResourcesView resources={resources} setResources={setResources} />
             )}
          </div>
        </main>
      </div>
    </>
  );
}

// ==========================================
// KOMPONEN: DASHBOARD
// ==========================================
function DashboardView({ tasks, totalFocusTime, streak, quote, onGoTasks, onGoAi }) {
  const pendingTasks = tasks.filter(t => t.status !== 'done').length;
  
  const formatFocusTime = (seconds) => {
     if (seconds === 0) return "0 Menit";
     const h = Math.floor(seconds / 3600);
     const m = Math.floor((seconds % 3600) / 60);
     if (h > 0) return `${h} Jam ${m} Mnt`;
     return `${m} Menit`;
  };

  const shortcuts = [
    { id: 'tasks', label: 'Tugas', icon: <CheckSquare size={20}/>, color: 'bg-indigo-600', tab: 'tasks-kanban' },
    { id: 'pomodoro', label: 'Timer', icon: <Timer size={20}/>, color: 'bg-rose-600', tab: 'pomodoro' },
    { id: 'ai', label: 'AI Quiz', icon: <FileQuestion size={20}/>, color: 'bg-amber-600', tab: 'ai-quiz' },
    { id: 'group', label: 'Group', icon: <Users size={20}/>, color: 'bg-emerald-600', tab: 'study-group' },
  ];

  return (
    <div className="animate-fade-slide space-y-8 md:space-y-12 max-w-7xl mx-auto pb-16 px-4">
      
      {/* Refined Modern Hero Section */}
      <div className="relative rounded-[3rem] overflow-hidden group shadow-2xl">
        <div className="absolute inset-0 bg-[#121214]"></div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[140px] -mr-64 -mt-64 group-hover:opacity-60 transition-opacity"></div>
        
        <div className="relative z-10 px-8 py-12 md:px-16 md:py-20 flex flex-col xl:flex-row items-center gap-16">
            <div className="flex-1 space-y-8 text-center xl:text-left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/[0.03] border border-white/10 rounded-full backdrop-blur-md">
                 <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                 <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">SISTEM PEMBELAJARAN PINTAR</span>
              </div>
              <h2 className="text-5xl md:text-8xl font-black text-white tracking-tight leading-[0.9]">
                Fokus Tanpa <span className="text-indigo-500">Batas.</span>
              </h2>
              <p className="text-gray-400 font-medium text-lg md:text-xl max-w-lg mx-auto xl:mx-0 leading-relaxed border-l-2 border-indigo-500/30 pl-6">
                "{quote.split('-')[0].trim()}"
              </p>
              <div className="flex flex-wrap justify-center xl:justify-start gap-4 pt-4">
                 <button onClick={onGoTasks} className="bg-indigo-600 text-white hover:bg-indigo-700 px-10 py-5 rounded-2xl font-black transition-all shadow-xl flex items-center gap-3 text-sm active:scale-95">
                    MULAI BELAJAR <ChevronRight size={18} />
                 </button>
                 <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 px-8 py-5 rounded-2xl text-white font-bold backdrop-blur-md">
                    <Flame className="text-orange-500" size={24} />
                    <span>{streak} Hari Beruntun</span>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full xl:w-80">
               <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 hover:bg-white/[0.05] transition-all">
                  <p className="text-5xl font-black text-white">{pendingTasks}</p>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tugas Utama</p>
               </div>
               <div className="bg-white/[0.03] border border-white/10 p-8 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 hover:bg-white/[0.05] transition-all">
                  <p className="text-5xl font-black text-emerald-500">{tasks.filter(t => t.status === 'done').length}</p>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Terselesaikan</p>
               </div>
               <div className="md:col-span-2 bg-indigo-500/10 border border-indigo-500/20 p-8 rounded-[2.5rem] flex items-center justify-between">
                  <div>
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Waktu Fokus Total</h4>
                    <p className="text-3xl font-black text-white">{formatFocusTime(totalFocusTime)}</p>
                  </div>
                  <Timer size={32} className="text-indigo-400/30" />
               </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        {/* Main Content Area */}
        <div className="lg:col-span-8 space-y-10">
          <div className="flex items-center justify-between px-3">
             <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.4em] flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 shadow-xl shadow-indigo-500/5">
                 <CheckSquare size={18} />
               </div>
               Prioritas Agenda
             </h3>
             <button onClick={onGoTasks} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-[0.2em] bg-white/[0.03] px-6 py-3 rounded-full border border-white/5">Selengkapnya &rarr;</button>
          </div>

          <div className="grid gap-5">
             {tasks.filter(t => t.status !== 'done').slice(0, 5).map((task) => (
                <div key={task.id} className="bg-[#121214] border border-white/5 px-8 py-7 rounded-[2.5rem] hover:bg-[#18181b] hover:border-indigo-500/40 transition-all flex flex-col md:flex-row items-center justify-between gap-8 group shadow-xl">
                   <div className="flex items-center gap-8 w-full">
                      <div className={`w-3 h-14 rounded-full flex-shrink-0 ${task.difficulty === 'Sulit' ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)]' : task.difficulty === 'Sedang' ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]'}`}></div>
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${task.difficulty === 'Sulit' ? 'bg-rose-500/10 text-rose-500' : task.difficulty === 'Sedang' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{task.difficulty}</span>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.1em] flex items-center gap-2"><CalendarDays size={12}/> {task.dueDate || 'Hari Ini'}</p>
                         </div>
                         <p className="font-extrabold text-white text-xl md:text-2xl truncate group-hover:text-indigo-400 transition-colors tracking-tight uppercase leading-none">{task.title}</p>
                      </div>
                      <button onClick={onGoTasks} className="hidden md:flex w-16 h-16 bg-white/[0.03] border border-white/5 rounded-2xl items-center justify-center text-gray-400 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-500 transition-all shadow-xl active:scale-95">
                         <ExternalLink size={24} />
                      </button>
                   </div>
                   <button onClick={onGoTasks} className="md:hidden w-full py-5 bg-white/[0.03] border border-white/5 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">BUKA AGENDA</button>
                </div>
             ))}
             {pendingTasks === 0 && (
                <div className="bg-[#121214] border border-white/5 min-h-[350px] rounded-[4rem] flex flex-col items-center justify-center text-center p-12 shadow-inner">
                   <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-emerald-500/20"><CheckCircle2 className="text-emerald-500" size={48} /></div>
                   <h4 className="text-3xl font-black text-white mb-4">Agenda Tuntas!</h4>
                   <p className="text-gray-500 text-lg max-w-sm font-medium leading-relaxed">Semua tugas telah selesai. Waktunya untuk recharge energi atau rencanakan langkah berikutnya.</p>
                </div>
             )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-[#121214] border border-white/5 rounded-[2.5rem] p-8 space-y-8">
             <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] text-center border-b border-white/5 pb-4">Akses Cepat</h3>
             <div className="grid grid-cols-2 gap-4">
               {shortcuts.map(s => (
                 <button 
                  key={s.id} 
                  onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: s.tab }))}
                  className="group flex flex-col items-center justify-center gap-4 text-center active:scale-95"
                 >
                   <div className={`w-14 h-14 rounded-2xl ${s.color} flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-all duration-300`}>
                      {React.cloneElement(s.icon, { size: 24 })}
                   </div>
                   <span className="text-[10px] font-black text-gray-500 group-hover:text-white uppercase tracking-widest transition-colors">{s.label}</span>
                 </button>
               ))}
             </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 p-10 rounded-[2.5rem] text-white relative overflow-hidden group shadow-2xl">
             <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-[60px] -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-1000"></div>
             <div className="relative z-10 space-y-6">
                <Sparkles className="text-indigo-200" size={32} />
                <h4 className="text-xl font-black tracking-tight leading-tight uppercase">Saran AI Fokus</h4>
                <p className="text-indigo-100 text-sm font-medium leading-relaxed opacity-90">
                   Gunakan sesi Pomodoro 45 menit untuk tugas berat, istirahat 10 menit. Teknik ini terbukti meningkatkan daya ingat jangka panjang.
                </p>
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'pomodoro' }))}
                  className="w-full bg-white text-indigo-700 font-black py-4 rounded-xl text-[10px] uppercase tracking-widest transition-all hover:bg-indigo-50 shadow-xl active:scale-95"
                >
                   Optimalkan Sekarang
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// KOMPONEN: KANBAN TASKS (DRAG & DROP)
// ==========================================
function TasksView({ tasks, setTasks, highlightedTaskId, currentUser }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDiff, setNewTaskDiff] = useState('Sedang');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskLinks, setNewTaskLinks] = useState<{name: string, url: string}[]>([]);
  const [tempLinkName, setTempLinkName] = useState('');
  const [tempLinkUrl, setTempLinkUrl] = useState('');

  const openModalForEdit = (task) => {
    setNewTaskTitle(task.title);
    setNewTaskDiff(task.difficulty);
    setNewTaskDate(task.dueDate);
    setNewTaskLinks(task.links || []);
    setEditingTaskId(task.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskDate('');
    setNewTaskDiff('Sedang');
    setNewTaskLinks([]);
    setTempLinkName('');
    setTempLinkUrl('');
  };

  const addLinkToTask = () => {
    if (!tempLinkName.trim() || !tempLinkUrl.trim()) return;
    setNewTaskLinks([...newTaskLinks, { name: tempLinkName, url: tempLinkUrl }]);
    setTempLinkName('');
    setTempLinkUrl('');
  };

  const removeLinkFromTask = (index) => {
    setNewTaskLinks(newTaskLinks.filter((_, i) => i !== index));
  };

  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !currentUser) return;
    
    const taskPath = editingTaskId 
      ? `users/${currentUser.uid}/tasks/${editingTaskId}` 
      : `users/${currentUser.uid}/tasks`;

    try {
      if (editingTaskId) {
         const taskRef = doc(db, 'users', currentUser.uid, 'tasks', String(editingTaskId));
         await updateDoc(taskRef, {
           title: newTaskTitle,
           difficulty: newTaskDiff,
           dueDate: newTaskDate,
           links: newTaskLinks,
           updatedAt: serverTimestamp()
         });
      } else {
         const tasksCol = collection(db, 'users', currentUser.uid, 'tasks');
         await addDoc(tasksCol, {
           title: newTaskTitle,
           status: 'todo',
           difficulty: newTaskDiff,
           dueDate: newTaskDate,
           links: newTaskLinks,
           createdAt: serverTimestamp(),
           updatedAt: serverTimestamp()
         });
      }
      closeModal();
    } catch (err) {
      handleFirestoreError(err, editingTaskId ? OperationType.UPDATE : OperationType.CREATE, taskPath);
    }
  };

  const moveTask = async (id, newStatus) => {
    if (!currentUser) return;
    const taskPath = `users/${currentUser.uid}/tasks/${id}`;
    try {
      const taskRef = doc(db, 'users', currentUser.uid, 'tasks', String(id));
      await updateDoc(taskRef, { 
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, taskPath);
    }
  };

  const deleteTask = async (id) => {
    if (!currentUser) return;
    if (!confirm("Hapus tugas ini?")) return;
    const taskPath = `users/${currentUser.uid}/tasks/${id}`;
    try {
      const taskRef = doc(db, 'users', currentUser.uid, 'tasks', String(id));
      await deleteDoc(taskRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, taskPath);
    }
  };

  const [activeColumn, setActiveColumn] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e) => {
    const scrollLeft = e.target.scrollLeft;
    const width = e.target.offsetWidth;
    const index = Math.round(scrollLeft / width);
    setActiveColumn(index);
  };

  return (
    <div className="animate-fade-slide h-full flex flex-col max-w-6xl mx-auto relative overflow-hidden">
      {/* Mobile Column Paging Indicator */}
      <div className="md:hidden flex justify-center gap-2 mb-6">
          <div className="flex gap-2 p-1.5 bg-[#121214] border border-[#27272a] rounded-full">
            <div className={`w-2 h-2 rounded-full transition-all ${activeColumn === 0 ? 'bg-indigo-500 w-6' : 'bg-gray-700'}`}></div>
            <div className={`w-2 h-2 rounded-full transition-all ${activeColumn === 1 ? 'bg-indigo-500 w-6' : 'bg-gray-700'}`}></div>
            <div className={`w-2 h-2 rounded-full transition-all ${activeColumn === 2 ? 'bg-indigo-500 w-6' : 'bg-gray-700'}`}></div>
          </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex flex-row md:grid md:grid-cols-3 md:gap-8 flex-1 min-h-[70vh] overflow-x-auto snap-x snap-mandatory md:snap-none custom-scrollbar pb-6 px-4 md:px-0"
      >
         <div className="w-[85vw] sm:w-[80vw] md:w-auto flex-shrink-0 snap-center md:snap-align-none">
            <TaskColumn title="🎯 Harus Dikerjakan" status="todo" tasks={tasks} onMove={moveTask} onDelete={deleteTask} onEdit={openModalForEdit} highlightedTaskId={highlightedTaskId} />
         </div>
         <div className="w-[85vw] sm:w-[80vw] md:w-auto flex-shrink-0 snap-center md:snap-align-none">
            <TaskColumn title="⏳ Sedang Berjalan" status="doing" tasks={tasks} onMove={moveTask} onDelete={deleteTask} onEdit={openModalForEdit} highlightedTaskId={highlightedTaskId} />
         </div>
         <div className="w-[85vw] sm:w-[80vw] md:w-auto flex-shrink-0 snap-center md:snap-align-none">
            <TaskColumn title="✅ Selesai" status="done" tasks={tasks} onMove={moveTask} onDelete={deleteTask} onEdit={openModalForEdit} highlightedTaskId={highlightedTaskId} />
         </div>
      </div>

      <button onClick={() => setIsModalOpen(true)} className="fixed md:absolute bottom-6 right-6 w-14 h-14 md:w-16 md:h-16 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.5)] transition-transform hover:scale-110 active:scale-95 z-40">
        <Plus size={28} className="md:w-8 md:h-8" />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <div className="bg-[#121214] border border-[#27272a] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-slide">
              <div className="flex justify-between items-center p-6 border-b border-[#27272a]">
                 <h2 className="text-xl font-bold text-white">{editingTaskId ? 'Edit Tugas' : 'Tambah Tugas Baru'}</h2>
                 <button onClick={closeModal} className="text-gray-400 hover:text-rose-500 transition-colors"><X size={20}/></button>
              </div>
              <form onSubmit={handleSaveTask} className="p-6 space-y-5">
                 <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Nama Tugas</label>
                    <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Contoh: PR Matematika Hal. 24" required
                           className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Kesulitan</label>
                       <select value={newTaskDiff} onChange={e => setNewTaskDiff(e.target.value)} className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 cursor-pointer">
                          <option value="Mudah">🟢 Mudah</option>
                          <option value="Sedang">🟡 Sedang</option>
                          <option value="Sulit">🔴 Sulit</option>
                       </select>
                    </div>
                    <div>
                       <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Jadwal / Deadline</label>
                       <input type="date" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} required
                              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 cursor-pointer" />
                    </div>
                 </div>

                 <div className="space-y-3">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide">Tautan Materi / Referensi</label>
                    <div className="flex gap-2">
                       <div className="flex-1 space-y-2">
                          <input type="text" value={tempLinkName} onChange={e => setTempLinkName(e.target.value)} placeholder="Nama Link (misal: Modul PDF)" 
                              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                          <input type="text" value={tempLinkUrl} onChange={e => setTempLinkUrl(e.target.value)} placeholder="https://..." 
                              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                       </div>
                       <button type="button" onClick={addLinkToTask} className="w-12 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all">
                          <Plus size={20}/>
                       </button>
                    </div>
                    <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-2">
                       {newTaskLinks.map((link, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-[#18181b] p-2 px-3 rounded-lg border border-[#27272a]">
                             <div className="flex items-center gap-2 overflow-hidden">
                                <Link2 size={12} className="text-indigo-400 flex-shrink-0"/>
                                <span className="text-[10px] text-gray-300 truncate font-medium">{link.name}</span>
                             </div>
                             <button type="button" onClick={() => removeLinkFromTask(idx)} className="text-gray-600 hover:text-rose-500 transition-colors">
                                <X size={12}/>
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>

                 <div className="pt-4 flex justify-end gap-3">
                    <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl font-semibold text-gray-400 hover:bg-[#18181b] transition-colors">Batal</button>
                    <button type="submit" className="px-6 py-2.5 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-900/40">
                      {editingTaskId ? 'Simpan Perubahan' : 'Simpan Tugas'}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

function TaskColumn({ title, status, tasks, onMove, onDelete, onEdit, highlightedTaskId }) {
  const columnTasks = tasks.filter(t => t.status === status);
  const handleDragOver = (e) => { e.preventDefault(); };
  const handleDrop = (e) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    onMove(taskId, status);
  };

  return (
    <div onDragOver={handleDragOver} onDrop={handleDrop} className="bg-[#121214] border border-[#27272a] rounded-2xl flex flex-col overflow-hidden h-full">
      <div className="p-4 border-b border-[#27272a] bg-[#18181b]">
        <h3 className="font-bold text-white flex justify-between items-center">
           {title} <span className="bg-[#27272a] text-gray-300 text-xs px-2.5 py-1 rounded-full">{columnTasks.length}</span>
        </h3>
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-3">
        {columnTasks.map(task => {
           const isHighlighted = highlightedTaskId === task.id;
           return (
              <div 
                key={task.id} 
                draggable 
                onDragStart={(e) => { e.dataTransfer.setData('taskId', task.id); }}
                className={`bg-[#1c1c1f] p-4 rounded-xl border transition-all group relative cursor-grab active:cursor-grabbing shadow-sm ${
                   isHighlighted 
                   ? 'border-indigo-500 ring-2 ring-indigo-500/50 scale-105 z-10 animate-glow' 
                   : 'border-[#27272a] hover:border-indigo-500/50'
                }`}
              >
                 <div className="flex justify-between items-start mb-2">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${task.difficulty === 'Sulit' ? 'bg-rose-500/10 text-rose-500' : task.difficulty === 'Sedang' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                       {task.difficulty}
                    </span>
                    <div className="flex items-center gap-2">
                       <button onClick={() => onEdit(task)} className="text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Edit Tugas"><Pencil size={14}/></button>
                       <button 
                         onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} 
                         className="p-2 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-100 md:opacity-0 group-hover:opacity-100" 
                         title="Hapus Tugas"
                       >
                         <Trash2 size={14}/>
                       </button>
                       <GripHorizontal size={14} className="text-gray-600 opacity-50 group-hover:opacity-100 cursor-grab"/>
                    </div>
                 </div>
                 <p className="text-sm font-semibold text-gray-200 mb-3">{task.title}</p>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center text-xs font-medium text-gray-500 gap-1.5">
                       <CalendarDays size={12} className="text-indigo-400"/> {task.dueDate}
                    </div>
                    {task.links && task.links.length > 0 && (
                       <div className="flex items-center gap-1 text-emerald-400">
                          <Link2 size={10}/>
                          <span className="text-[10px] font-bold">{task.links.length}</span>
                       </div>
                    )}
                 </div>
                 
                 {task.links && task.links.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#27272a] flex flex-wrap gap-2">
                       {task.links.map((link, idx) => (
                          <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="text-[9px] bg-[#121214] border border-[#27272a] px-2 py-1 rounded text-gray-400 hover:text-white hover:border-indigo-500 transition-all flex items-center gap-1">
                             <ExternalLink size={8}/> {link.name}
                          </a>
                       ))}
                    </div>
                 )}
              </div>
           );
        })}
        {columnTasks.length === 0 && (
           <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-[#27272a] rounded-xl p-6 text-center">
             <span className="text-sm font-medium text-gray-500 mb-1">Kosong</span>
             <span className="text-xs text-gray-600">Tarik dan lepas tugas di sini</span>
           </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// KOMPONEN: KALENDER REAL-TIME
// ==========================================
function CalendarView({ tasks }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
     <div className="animate-fade-slide h-full flex flex-col max-w-6xl mx-auto">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <h2 className="text-2xl md:text-4xl font-black text-white flex items-center gap-4 uppercase tracking-tighter">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-500 shadow-inner">
                <CalendarDays size={32} /> 
              </div>
              Kalender <span className="text-indigo-500">Tugas</span>
            </h2>
            <div className="flex items-center gap-3 md:gap-4 bg-[#121214] border border-[#27272a] rounded-2xl p-1.5 w-full sm:w-auto overflow-hidden shadow-2xl">
               <button onClick={prevMonth} className="p-3 hover:bg-[#27272a] rounded-xl text-gray-400 hover:text-white transition-all flex-shrink-0 active:scale-90"><ChevronLeft size={24}/></button>
               <span className="font-black text-white flex-1 sm:min-w-[180px] text-center text-sm md:text-lg tracking-tighter uppercase">{monthNames[month]} {year}</span>
               <button onClick={nextMonth} className="p-3 hover:bg-[#27272a] rounded-xl text-gray-400 hover:text-white transition-all flex-shrink-0 active:scale-90"><ChevronRight size={24}/></button>
            </div>
         </div>

         <div className="bg-[#121214] border border-[#27272a] rounded-[2rem] overflow-hidden flex-1 flex flex-col shadow-2xl relative">
            {/* Header Hari */}
            <div className="grid grid-cols-7 bg-[#18181b] border-b border-[#27272a]">
               {dayNames.map(d => (
                  <div key={d} className="py-4 text-center text-[10px] md:text-xs font-black text-gray-500 uppercase tracking-widest">{d}</div>
               ))}
            </div>
            
            {/* Grid Kalender */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto min-h-[400px]">
               {blanks.map(b => (
                  <div key={`blank-${b}`} className="min-h-[70px] md:min-h-0 border-b border-r border-[#27272a]/30 bg-[#121214]/50"></div>
               ))}
               
               {days.map(day => {
                  const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayTasks = tasks.filter(t => t.dueDate === cellDateStr);
                  const isToday = new Date().toISOString().split('T')[0] === cellDateStr;

                  return (
                     <div key={day} className={`min-h-[70px] md:min-h-0 border-b border-r border-[#27272a] p-1 md:p-2.5 flex flex-col gap-1 overflow-hidden hover:bg-[#18181b] transition-colors relative group ${isToday ? 'bg-indigo-900/5' : ''}`}>
                        <div className={`text-right text-[10px] md:text-xs font-black p-1 ${isToday ? 'text-indigo-400' : 'text-gray-500'}`}>
                           <span className={isToday ? 'bg-indigo-500/20 px-2.5 py-1 rounded-lg' : ''}>{day}</span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
                           {dayTasks.map(t => (
                              <div key={t.id} className={`text-[8px] md:text-[9px] font-bold px-1.5 py-1 rounded-lg truncate transition-all ${t.status === 'done' ? 'bg-[#27272a]/50 text-gray-600 line-through' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`} title={t.title}>
                                {t.title}
                              </div>
                           ))}
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>
     </div>
  );
}

// ==========================================
// KOMPONEN: GLOBAL POMODORO TIMER 
// ==========================================
function PomodoroView({ 
   inputFocus, setInputFocus, inputBreak, setInputBreak,
   isSetupMode, setIsSetupMode, mode, setMode,
   timeLeft, setTimeLeft, isRunning, setIsRunning,
   targetTime, setTargetTime, lastLocalAction,
   setSyncTrigger
}) {

  const handleStartSession = (e) => {
    e.preventDefault();
    if (inputFocus <= 0 || inputBreak <= 0) return alert("Masukkan waktu yang valid!");
    
    lastLocalAction.current = Date.now();
    const duration = inputFocus * 60;
    const target = Date.now() + (duration * 1000);
    
    setTargetTime(target);
    setIsSetupMode(false);
    setMode('focus');
    setTimeLeft(duration);
    setIsRunning(true);
    setSyncTrigger(prev => prev + 1);
  };

  const pauseTimer = () => {
    lastLocalAction.current = Date.now();
    setIsRunning(false);
    setSyncTrigger(prev => prev + 1);
  };

  const resumeTimer = () => {
    lastLocalAction.current = Date.now();
    // Re-calculate target based on remaining time
    const target = Date.now() + (timeLeft * 1000);
    setTargetTime(target);
    setIsRunning(true);
    setSyncTrigger(prev => prev + 1);
  };

  const stopSession = () => { 
    lastLocalAction.current = Date.now();
    setIsRunning(false); 
    setIsSetupMode(true); 
    setTargetTime(null);
    setSyncTrigger(prev => prev + 1);
  };

  const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const seconds = (timeLeft % 60).toString().padStart(2, '0');
  const baseTime = (mode === 'focus' ? inputFocus * 60 : inputBreak * 60);
  const progress = isSetupMode ? 100 : ((baseTime - timeLeft) / baseTime) * 100;
  
  if (isSetupMode) {
    return (
       <div className="animate-fade-slide flex flex-col items-center justify-center max-w-lg mx-auto pb-6 md:pb-10 min-h-[70vh]">
          <div className="bg-[#121214] border border-[#27272a] rounded-[2.5rem] p-6 md:p-10 lg:p-12 w-full shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-indigo-500/5 rounded-full blur-[100px]"></div>
             
             <div className="text-center mb-6 md:mb-10 relative z-10">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-[#18181b] border border-[#27272a] rounded-3xl flex items-center justify-center mx-auto mb-6 text-indigo-500 shadow-xl">
                   <Timer size={32} className="md:w-10 md:h-10" />
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-white mb-3 uppercase tracking-tighter">Sesi Fokus Baru</h2>
                <p className="text-xs md:text-sm text-gray-500 font-bold uppercase tracking-widest">Atur target belajarmu sekarang.</p>
             </div>

             <form onSubmit={handleStartSession} className="space-y-5 md:space-y-8 relative z-10">
                 <div className="bg-[#18181b] p-4 md:p-5 rounded-2xl border border-[#27272a]">
                    <label className="block text-[10px] md:text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 md:mb-3 flex justify-between">
                       <span>Waktu Fokus</span> <span>(Menit)</span>
                    </label>
                    <input type="number" min="1" max="180" value={inputFocus} onChange={(e) => setInputFocus(Number(e.target.value))} className="w-full bg-transparent text-3xl md:text-4xl font-extrabold text-white focus:outline-none border-b-2 border-[#3f3f46] focus:border-indigo-500 transition-colors pb-2" />
                 </div>
                 <div className="bg-[#18181b] p-4 md:p-5 rounded-2xl border border-[#27272a]">
                    <label className="block text-[10px] md:text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 md:mb-3 flex justify-between">
                       <span>Waktu Istirahat</span> <span>(Menit)</span>
                    </label>
                    <input type="number" min="1" max="60" value={inputBreak} onChange={(e) => setInputBreak(Number(e.target.value))} className="w-full bg-transparent text-3xl md:text-4xl font-extrabold text-white focus:outline-none border-b-2 border-[#3f3f46] focus:border-emerald-500 transition-colors pb-2" />
                 </div>
                 <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base md:text-lg py-3 md:py-4 rounded-xl shadow-lg shadow-indigo-900/30 transition-all active:scale-95 flex items-center justify-center gap-2 mt-2 md:mt-4">
                    <Play size={18} className="fill-current" /> Mulai Sesi Sekarang
                 </button>
              </form>
           </div>
        </div>
     );
  }

  return (
    <div className="animate-fade-slide flex flex-col items-center justify-start max-w-4xl mx-auto pb-16 md:pb-24 min-h-full px-4 sm:px-6">
      <div className={`px-8 py-3 rounded-full text-xs sm:text-sm font-black shadow-2xl mb-10 md:mb-14 mt-10 flex items-center gap-3 border backdrop-blur-xl ${mode === 'focus' ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300' : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'}`}>
         {mode === 'focus' ? <BrainCircuit size={20} className="animate-pulse"/> : <Coffee size={20} className="animate-bounce" />}
         <span className="uppercase tracking-[0.2em]">{mode === 'focus' ? 'Fokus Belajar' : 'Waktu Istirahat'}</span>
      </div>

      <div className={`relative w-full max-w-[16rem] sm:max-w-[20rem] md:max-w-[24rem] lg:max-w-[28rem] aspect-square rounded-full flex items-center justify-center mb-12 md:mb-16 transition-all duration-1000 relative group`}>
         {/* Simple Professional Ring */}
         <svg className="absolute inset-0 w-full h-full transform -rotate-90 drop-shadow-[0_0_30px_rgba(99,102,241,0.05)]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="#18181b" strokeWidth="2.5" strokeOpacity="0.5" />
            <circle 
              cx="50" 
              cy="50" 
              r="46" 
              fill="none" 
              stroke={mode === 'focus' ? '#6366f1' : '#10b981'} 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeDasharray="289" 
              strokeDashoffset={289 - (289 * progress / 100)} 
              className="transition-all duration-1000 ease-linear shadow-indigo-500/50" 
            />
         </svg>
         
         <div className="relative z-10 flex flex-col items-center">
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter tabular-nums leading-none select-none">
               {minutes}<span className="text-indigo-500 animate-pulse">:</span>{seconds}
            </h1>
            <div className="mt-6 flex items-center gap-3 bg-white/5 px-5 py-2 rounded-full border border-white/5 backdrop-blur-xl shadow-lg">
               <div className={`w-2 h-2 rounded-full animate-pulse ${mode === 'focus' ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
               <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">{isRunning ? 'Running' : 'Paused'}</span>
            </div>
         </div>
      </div>

      <div className="flex items-center gap-6 md:gap-8">
         <button onClick={stopSession} title="Akhiri Sesi" className="w-14 h-14 md:w-16 md:h-16 bg-[#18181b] border border-white/5 hover:border-rose-500 rounded-2xl md:rounded-[1.8rem] flex items-center justify-center text-gray-500 hover:text-rose-500 transition-all shadow-xl active:scale-95">
            <ArrowLeft size={24} />
         </button>
         <button onClick={isRunning ? pauseTimer : resumeTimer} className={`w-20 h-20 md:w-24 md:h-24 rounded-3xl md:rounded-[2.5rem] flex items-center justify-center text-white transition-all shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)] hover:scale-105 active:scale-95 relative overflow-hidden group/play ${isRunning ? 'bg-amber-500' : 'bg-indigo-600'}`}>
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/play:opacity-100 transition-opacity"></div>
            {isRunning ? <Pause size={32} className="fill-current" /> : <Play size={32} className="fill-current ml-1.5" />}
         </button>
         <button onClick={() => { setIsRunning(false); setTimeLeft(baseTime); }} title="Ulangi" className="w-14 h-14 md:w-16 md:h-16 bg-[#18181b] border border-white/5 hover:border-indigo-400 rounded-2xl md:rounded-[1.8rem] flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-all shadow-xl active:scale-95">
            <RotateCcw size={24} />
         </button>
      </div>
      
      <div className="mt-16 flex flex-wrap justify-center gap-6 opacity-40">
         <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
            <CheckCircle2 size={14}/> Selesaikan Sesi Untuk Poin
         </div>
         <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest">
            <Coffee size={14}/> Istirahat Teratur Itu Penting
         </div>
      </div>
    </div>
  );
}



// ==========================================
// BANTUAN UI
// ==========================================
interface NavItemProps {
  icon: any;
  label: any;
  active: any;
  onClick: any;
  badge?: any;
  hasSubmenu?: any;
  isOpen?: any;
}

function NavItem({ icon, label, active, onClick, badge = 0, hasSubmenu = false, isOpen = false }: NavItemProps) {
  return (
    <div 
      onClick={onClick} 
      className={`flex items-center justify-between px-5 py-4 rounded-[1.2rem] cursor-pointer transition-all font-black active:scale-95 group/nav ${active && !hasSubmenu ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-[0_15px_30px_-5px_rgba(79,70,229,0.4)] translate-x-1' : 'text-gray-500 hover:bg-white/[0.03] hover:text-white'}`}
    >
      <div className="flex items-center gap-4">
        <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover/nav:scale-110'}`}>
           {React.cloneElement(icon, { size: active ? 22 : 20, className: active ? 'text-white' : 'text-gray-500 group-hover/nav:text-indigo-400' })}
        </div>
        <span className={`text-sm tracking-tight ${active ? 'font-black' : 'font-bold underline-offset-4 decoration-indigo-500/50 hover:underline'}`}>{label}</span>
      </div>
      <div className="flex items-center gap-3">
         {badge !== undefined && badge > 0 && <span className="bg-rose-500 text-white text-[9px] min-w-[1.2rem] h-[1.2rem] flex items-center justify-center rounded-full font-black shadow-lg shadow-rose-900/40">{badge}</span>}
         {hasSubmenu && (isOpen ? <ChevronDown size={14} className="transform rotate-180 transition-all opacity-40" /> : <ChevronDown size={14} className="transition-all opacity-40 group-hover/nav:opacity-100" />)}
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, sub }) {
  return (
    <div className="bg-[#121214] border border-[#27272a] p-5 md:p-8 rounded-[2rem] hover:border-indigo-500/50 transition-all duration-300 group hover:bg-[#18181b] relative overflow-hidden h-full flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-indigo-500/10 transition-all"></div>
      <div>
         <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-[#18181b] rounded-2xl border border-[#27272a] flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-500 shadow-lg">{icon}</div>
            <h3 className="font-black text-gray-500 text-xs uppercase tracking-[0.2em]">{title}</h3>
         </div>
         <p className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tighter">{value}</p>
      </div>
      <p className="text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-tight mt-2 opacity-70 group-hover:opacity-100 transition-opacity">{sub}</p>
    </div>
  );
}

// ==========================================
// KOMPONEN: STUDY GROUP VIEW
// ==========================================
function StudyGroupView({ currentUser, userProfile }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Sync activeGroupId with current groups
  useEffect(() => {
    if (activeGroupId && !groups.find(g => g.id === activeGroupId) && !isLoading) {
      setActiveGroupId(null);
    }
  }, [groups, activeGroupId, isLoading]);

  // --- LISTEN TO USER'S GROUPS ---
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'groups'), where('members', 'array-contains', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const gList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGroups(gList);
      setIsLoading(false);
    }, (err) => {
      console.error("Groups listener error:", err);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const code = generateCode();
      const newGroup = {
        name: newGroupName.trim(),
        code,
        creatorId: currentUser.uid,
        createdAt: serverTimestamp(),
        members: [currentUser.uid]
      };
      const docRef = await addDoc(collection(db, 'groups'), newGroup);
      setActiveGroupId(docRef.id);
      setIsCreateModalOpen(false);
      setNewGroupName('');
    } catch (err) {
      console.error("Create Group Error:", err);
      alert("Gagal membuat group. Coba lagi.");
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    const groupsPath = 'groups';
    try {
      const q = query(collection(db, groupsPath), where('code', '==', code));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Kode grup tidak valid.");
        return;
      }

      const groupDoc = snapshot.docs[0];
      if (groupDoc.data().members.includes(currentUser.uid)) {
        setActiveGroupId(groupDoc.id);
        setIsJoinModalOpen(false);
        setJoinCode('');
        return;
      }

      const groupRef = doc(db, groupsPath, groupDoc.id);
      await updateDoc(groupRef, {
        members: arrayUnion(currentUser.uid)
      });

      // Send join system message
      const messagesPath = `groups/${groupDoc.id}/messages`;
      try {
        await addDoc(collection(db, messagesPath), {
          senderId: currentUser.uid, 
          senderName: 'Sistem',
          content: `${userProfile?.displayName || 'Seorang murid'} telah bergabung ke grup.`,
          timestamp: serverTimestamp(),
          isSystem: true
        });
      } catch (e) {
        console.warn("System join message failed", e);
      }

      setActiveGroupId(groupDoc.id);
      setIsJoinModalOpen(false);
      setJoinCode('');
    } catch (err) {
      console.error("Join Group Error:", err);
      try {
        const { handleFirestoreError, OperationType } = await import('./firebase');
        handleFirestoreError(err, OperationType.UPDATE, `${groupsPath}/${joinCode}`);
      } catch (logErr) {
        alert("Gagal bergabung ke group. " + (err instanceof Error ? err.message : "Kesalahan tidak diketahui"));
      }
    }
  };

  const [isLeaving, setIsLeaving] = useState<string | null>(null);

  const handleLeaveGroup = async (groupId: string) => {
    if (!confirm("Keluar dari grup ini? Anda perlu memasukkan kode kembali untuk bergabung.")) return;
    
    setIsLeaving(groupId);

    try {
      const groupRef = doc(db, 'groups', groupId);
      const messagesPath = `groups/${groupId}/messages`;

      // Use a transaction to ensure atomicity
      await runTransaction(db, async (transaction) => {
        const groupDoc = await transaction.get(groupRef);
        if (!groupDoc.exists()) return;

        const currentMembers = groupDoc.data().members || [];
        
        if (currentMembers.length <= 1 && currentMembers.includes(currentUser.uid)) {
          // I am the last member, delete the group
          transaction.delete(groupRef);
        } else {
          // More members exist, just remove myself
          transaction.update(groupRef, {
            members: arrayRemove(currentUser.uid)
          });
          
          // Also try to send a system message (this won't be part of transaction if it's separate, but we want it)
          // Actually transaction.set/add subcollections isn't as direct. 
          // Let's just update the group in transaction first.
        }
      });

      // Send system message outside of transaction to not block it
      try {
        await addDoc(collection(db, messagesPath), {
          senderId: currentUser.uid, 
          senderName: 'Sistem',
          content: `${userProfile?.displayName || 'Seorang murid'} telah meninggalkan grup.`,
          timestamp: serverTimestamp(),
          isSystem: true
        });
      } catch (e) {
        console.warn("System message failed, continuing leave...", e);
      }

      // Clear local state
      if (activeGroupId === groupId) {
        setActiveGroupId(null);
      }
      setIsLeaving(null);
    } catch (err: any) {
      setIsLeaving(null);
      console.error("Leave Group Error:", err);
      alert("Gagal keluar dari grup. Silakan coba lagi.");
    }
  };

  const renameGroup = async (groupId, newName) => {
    if (!newName.trim()) return;
    try {
      await updateDoc(doc(db, 'groups', groupId), { name: newName.trim() });
    } catch (err) {
      console.error("Rename Group Error:", err);
    }
  };

  if (activeGroupId) {
    const activeGroup = groups.find(g => g.id === activeGroupId);
    if (activeGroup) {
      return (
        <GroupRoom 
          group={activeGroup} 
          onBack={() => setActiveGroupId(null)} 
          onLeave={() => handleLeaveGroup(activeGroupId)}
          onRename={(name) => renameGroup(activeGroupId, name)}
          currentUser={currentUser}
          userProfile={userProfile}
        />
      );
    }
  }

  return (
    <div className="animate-fade-slide h-full flex flex-col w-full">
      <div className="p-8 md:p-12 mb-8 bg-[#121214] border-b border-[#27272a] flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
            <Users size={28} className="text-sky-400" /> STUDY <span className="text-sky-400">GROUP</span>
          </h2>
          <p className="text-xs text-gray-500 font-medium tracking-wide mt-1">Belajar bareng teman, pantau progress real-time.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsJoinModalOpen(true)}
            className="px-5 py-2.5 bg-[#18181b] border border-[#27272a] text-gray-300 hover:text-white rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <Code size={18} /> Gabung
          </button>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-sky-900/40 active:scale-95"
          >
            <Plus size={18} /> Buat Group
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 md:px-12 pb-12">
        <div className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20 opacity-50">
              <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mb-4"></div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Memuat Grup...</p>
            </div>
          ) : groups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map(group => (
            <div 
              key={group.id}
              onClick={() => setActiveGroupId(group.id)}
              className="bg-[#121214] border border-[#27272a] rounded-3xl p-6 cursor-pointer hover:border-sky-500/50 transition-all group relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 right-0 p-4 flex gap-2">
                <button 
                  disabled={isLeaving === group.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLeaveGroup(group.id);
                  }}
                  className={`p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 ${isLeaving === group.id ? 'bg-gray-700 animate-pulse cursor-wait' : 'bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white'}`}
                  title="Keluar dari Grup"
                >
                  <LogOut size={16} />
                </button>
                <ChevronRight className="text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity mt-2" />
              </div>
              <div className="w-12 h-12 bg-sky-600/10 rounded-2xl flex items-center justify-center text-sky-400 mb-4 group-hover:bg-sky-600 group-hover:text-white transition-all">
                <Users size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">{group.name}</h3>
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">
                <Hash size={12} className="text-sky-500" /> {group.code}
              </div>
              
              <div className="mt-auto flex items-center justify-between border-t border-[#27272a] pt-4">
                <div className="flex -space-x-2">
                  {group.members.slice(0, 3).map((m: string, i: number) => (
                    <div key={i} className="w-7 h-7 rounded-full border-2 border-[#121214] bg-[#18181b] overflow-hidden">
                       <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m}`} className="w-full h-full" />
                    </div>
                  ))}
                  {group.members.length > 3 && (
                    <div className="w-7 h-7 rounded-full border-2 border-[#121214] bg-[#27272a] flex items-center justify-center text-[10px] font-bold text-gray-400">
                      +{group.members.length - 3}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full">AKTIF</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-20 border-2 border-dashed border-[#27272a] rounded-[2.5rem] text-center bg-[#121214]/50">
          <div className="w-20 h-20 rounded-full bg-[#18181b] flex items-center justify-center mb-6 text-gray-600">
            <Users size={40} />
          </div>
          <h3 className="text-xl font-bold text-gray-300 mb-2">Belum Memiliki Grup</h3>
          <p className="text-sm text-gray-500 max-w-xs mb-8">Buat grup belajarmu sendiri atau masukkan kode untuk bergabung ke grup teman.</p>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-sky-600 hover:bg-sky-500 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-sky-900/40 active:scale-95"
          >
            Mulai Sekarang
          </button>
        </div>
      )}
        </div>
      </div>

      {/* MODAL BUAT GROUP */}
      {isCreateModalOpen && (
        <Modal title="Buat Study Group Baru" onClose={() => setIsCreateModalOpen(false)}>
           <form onSubmit={handleCreateGroup} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Nama Group</label>
                <input 
                  required
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Misal: Ambis UTBK 2024"
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-2xl px-6 py-4 text-white font-bold focus:outline-none focus:border-sky-500 transition-all"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-sky-900/40 active:scale-95"
              >
                Buat Sekarang
              </button>
           </form>
        </Modal>
      )}

      {/* MODAL GABUNG GROUP */}
      {isJoinModalOpen && (
        <Modal title="Gabung Study Group" onClose={() => setIsJoinModalOpen(false)}>
           <form onSubmit={handleJoinGroup} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Kode Group</label>
                <input 
                  required
                  maxLength={6}
                  type="text" 
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="6 Karakter Kode"
                  className="w-full bg-[#18181b] border border-[#27272a] rounded-2xl px-6 py-4 text-white font-bold text-center text-3xl tracking-[0.4em] focus:outline-none focus:border-sky-500 transition-all placeholder:text-[14px] placeholder:tracking-normal"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-sky-900/40 active:scale-95"
              >
                Gabung Sekarang
              </button>
           </form>
        </Modal>
      )}
    </div>
  );
}

// ==========================================
// KOMPONEN: AI AUTO QUIZ
// ==========================================
function AiQuizView({ currentUser }) {
  const [step, setStep] = useState<'setup' | 'loading' | 'quiz' | 'result' | 'history'>('setup');
  const [sourceType, setSourceType] = useState<'file' | 'link'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [quizType, setQuizType] = useState<'multiple_choice' | 'true_false'>('multiple_choice');
  
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);

  // Fetch History
  useEffect(() => {
    if (!currentUser) return;
    const historyQuery = query(
      collection(db, 'users', currentUser.uid, 'quizHistory'),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(historyQuery, (snap) => {
       setQuizHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/quizHistory`));
    return () => unsubscribe();
  }, [currentUser]);

  const extractTextFromFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + "\n";
      }
      return fullText;
    } else if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else {
      throw new Error("Format file tidak didukung. Gunakan PDF atau DOCX.");
    }
  };

  const generateQuiz = async () => {
    setIsGenerating(true);
    setError(null);
    setStep('loading');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      let context = "";
      let tools: any[] = [];

      if (sourceType === 'file' && file) {
        context = await extractTextFromFile(file);
      } else if (sourceType === 'link' && linkUrl) {
        context = `Gunakan link ini sebagai referensi: ${linkUrl}`;
        tools = [{ urlContext: {} }];
      } else {
        throw new Error("Pilih file atau masukkan link terlebih dahulu.");
      }

      if (!context && sourceType === 'file') throw new Error("Gagal mengekstrak teks dari file.");

      const prompt = `
        Berdasarkan materi berikut, buatkan kuis dalam format JSON.
        Materi: ${context.substring(0, 30000)} ${sourceType === 'link' ? `\nLink: ${linkUrl}` : ''}
        
        Aturan kuis:
        1. Jumlah pertanyaan: ${questionCount}
        2. Tipe: ${quizType === 'multiple_choice' ? 'Pilihan Ganda (4 opsi)' : 'Benar/Salah'}
        3. Bahasa: Indonesia
        
        Output harus berupa JSON murni dengan struktur:
        {
          "questions": [
            {
              "question": "teks pertanyaan",
              "options": ["opsi A", "opsi B", "opsi C", "opsi D"],
              "correctAnswer": 0, // index opsi yang benar (0-3)
              "explanation": "penjelasan singkat mengapa jawaban itu benar"
            }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          tools: tools,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.NUMBER },
                    explanation: { type: Type.STRING }
                  },
                  required: ["question", "options", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["questions"]
          }
        }
      });

      const data = JSON.parse(response.text);
      if (!data.questions || data.questions.length === 0) throw new Error("AI gagal menghasilkan pertanyaan.");
      
      setQuestions(data.questions);
      setAnswers({});
      setCurrentIdx(0);
      setStep('quiz');
    } catch (err: any) {
      console.error("Quiz Gen Error:", err);
      setError(err.message || "Terjadi kesalahan saat membuat kuis.");
      setStep('setup');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLevelComplete = async () => {
    const score = calculateScore();
    setStep('result');

    if (currentUser) {
      try {
        await addDoc(collection(db, 'users', currentUser.uid, 'quizHistory'), {
          score,
          questionCount: questions.length,
          type: quizType,
          questions: questions,
          userAnswers: answers,
          createdAt: serverTimestamp(),
          title: sourceType === 'file' ? file?.name : linkUrl
        });
      } catch (err) {
        console.error("Save Quiz Error:", err);
      }
    }
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correct++;
    });
    return Math.round((correct / questions.length) * 100);
  };

  if (step === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center animate-fade-slide min-h-[70vh]">
        <div className="relative mb-8">
           <div className="w-24 h-24 border-b-4 border-l-4 border-pink-500 rounded-full animate-spin"></div>
           <div className="absolute inset-0 flex items-center justify-center text-pink-500">
              <Sparkles size={40} className="animate-pulse" />
           </div>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">AI Sedang Meracik Kuis...</h2>
        <p className="text-gray-500 max-w-sm">Mohon tunggu sebentar, asisten AI sedang membaca materimu dan membuat pertanyaan yang menantang.</p>
      </div>
    );
  }

  if (step === 'quiz') {
    const q = questions[currentIdx];
    const progress = ((currentIdx + 1) / questions.length) * 100;

    return (
      <div className="flex-1 flex flex-col w-full animate-fade-slide">
        <div className="p-8 md:p-12 mb-8 bg-[#121214] border-b border-[#27272a]">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400">
                  <FileQuestion size={24} />
               </div>
               <div>
                  <h2 className="text-lg font-bold text-white">Pertanyaan {currentIdx + 1} dari {questions.length}</h2>
                  <div className="w-48 h-1.5 bg-[#18181b] rounded-full mt-1 overflow-hidden">
                     <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                  </div>
               </div>
            </div>
            <button onClick={() => {if(confirm("Batalkan kuis?")) setStep('setup')}} className="text-xs font-bold text-gray-500 hover:text-rose-500 uppercase tracking-widest transition-colors">Batal</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 md:px-12 pb-12">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-[#121214] border border-[#27272a] rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Sparkles size={120} className="text-pink-500" />
               </div>
               <h3 className="text-xl md:text-2xl font-bold text-white mb-10 leading-relaxed relative z-10">{q.question}</h3>
               
               <div className="grid grid-cols-1 gap-4 relative z-10">
                  {q.options.map((opt: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setAnswers({...answers, [currentIdx]: idx})}
                      className={`group p-5 rounded-2xl border text-left transition-all flex items-center gap-4 ${
                        answers[currentIdx] === idx 
                        ? 'bg-pink-600 border-pink-600 text-white shadow-lg shadow-pink-900/20' 
                        : 'bg-[#18181b] border-[#27272a] text-gray-400 hover:border-gray-600 hover:text-white'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 transition-colors ${
                        answers[currentIdx] === idx ? 'bg-white/20 text-white' : 'bg-[#121214] text-gray-500 group-hover:bg-[#09090b]'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className="font-bold">{opt}</span>
                    </button>
                  ))}
               </div>
            </div>

            <div className="flex justify-between items-center bg-[#121214] border border-[#27272a] p-4 rounded-3xl">
               <button 
                 disabled={currentIdx === 0}
                 onClick={() => setCurrentIdx(currentIdx - 1)}
                 className="px-6 py-3 text-gray-500 hover:text-white disabled:opacity-0 transition-all font-bold"
               >
                 Kembali
               </button>
               
               {currentIdx < questions.length - 1 ? (
                 <button 
                   disabled={answers[currentIdx] === undefined}
                   onClick={() => setCurrentIdx(currentIdx + 1)}
                   className="bg-[#18181b] hover:bg-[#27272a] text-white px-10 py-3 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                 >
                   Lanjut <ChevronRight size={18} />
                 </button>
               ) : (
                 <button 
                   disabled={answers[currentIdx] === undefined}
                   onClick={handleLevelComplete}
                   className="bg-pink-600 hover:bg-pink-500 text-white px-12 py-3 rounded-2xl font-black transition-all shadow-lg shadow-pink-900/40 active:scale-95"
                 >
                   Selesai & Lihat Hasil
                 </button>
               )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'result') {
    const score = calculateScore();
    return (
      <div className="flex-1 flex flex-col w-full animate-fade-slide">
         <div className="p-8 md:p-12 mb-8 bg-[#121214] border-b border-[#27272a] text-center shadow-lg">
            <h2 className="text-3xl font-black text-white tracking-tighter">HASIL <span className="text-pink-500">ANALISIS KUIS</span></h2>
         </div>
         <div className="flex-1 overflow-y-auto px-5 md:px-12 pb-12">
            <div className="max-w-4xl mx-auto space-y-12">
              <div className="bg-[#121214] border border-[#27272a] rounded-[3.5rem] p-10 md:p-16 text-center shadow-2xl relative overflow-hidden w-full group">
                 <div className="absolute inset-0 bg-gradient-to-br from-pink-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <div className={`text-7xl md:text-9xl font-black mb-8 ${score >= 70 ? 'text-emerald-500' : score >= 40 ? 'text-amber-500' : 'text-rose-500'} tracking-tighter`}>
                    {score}%
                 </div>
                 <h2 className="text-3xl md:text-4xl font-black text-white mb-6 uppercase tracking-tight">
                    {score >= 80 ? 'Master Pelajaran!' : score >= 60 ? 'Hampir Sempurna!' : 'Coba Lagi Yuk!'}
                 </h2>
                 <p className="text-gray-400 mb-12 max-w-md mx-auto font-medium leading-relaxed opacity-80">Wawasanmu hari ini sudah tercatat. Simak detail jawaban di bawah untuk evaluasi belajarmu.</p>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 text-left">
                    <div className="bg-[#18181b] p-6 rounded-[2rem] border border-[#27272a] flex items-center justify-between">
                       <div>
                          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Benar</p>
                          <p className="text-2xl font-bold text-emerald-500">{questions.filter((q,i) => answers[i] === q.correctAnswer).length} Soal</p>
                       </div>
                       <CheckCircle2 className="text-emerald-500/20" size={40} />
                    </div>
                    <div className="bg-[#18181b] p-6 rounded-[2rem] border border-[#27272a] flex items-center justify-between">
                       <div>
                          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">Salah</p>
                          <p className="text-2xl font-bold text-rose-500">{questions.length - questions.filter((q,i) => answers[i] === q.correctAnswer).length} Soal</p>
                       </div>
                       <X className="text-rose-500/20" size={40} />
                    </div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
                    <button 
                      onClick={() => setStep('setup')}
                      className="bg-white/5 hover:bg-white/10 text-white font-black py-5 px-12 rounded-2xl transition-all border border-white/5 shadow-xl hover:border-white/10"
                    >
                      KEMBALI KE BERANDA
                    </button>
                    <button 
                      onClick={() => { setAnswers({}); setCurrentIdx(0); setStep('quiz'); }}
                      className="bg-pink-600 hover:bg-pink-500 text-white font-black py-5 px-14 rounded-2xl shadow-xl shadow-pink-900/40 transition-all active:scale-95 flex items-center justify-center gap-3"
                    >
                      RETAK KUIS <RotateCcw size={20} />
                    </button>
                 </div>
              </div>

              {/* Detail Summary Answer */}
              <div className="space-y-6">
                 <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.5em] text-center mb-8 bg-white/5 py-4 rounded-full">Detail Evaluasi</h3>
                 {questions.map((q, i) => {
                    const isCorrect = answers[i] === q.correctAnswer;
                    return (
                       <div key={i} className={`bg-[#121214] border rounded-[2.5rem] p-8 shadow-xl transition-all ${isCorrect ? 'border-emerald-500/20 hover:border-emerald-500/40' : 'border-rose-500/20 hover:border-rose-500/40'}`}>
                          <div className="flex items-start justify-between gap-6 mb-6">
                             <div className="flex-1">
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Pertanyaan {i + 1}</p>
                                <h4 className="text-lg md:text-xl font-bold text-white leading-relaxed">{q.question}</h4>
                             </div>
                             <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${isCorrect ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {isCorrect ? <CheckCircle2 size={24} /> : <X size={24} />}
                             </div>
                          </div>
                          
                          <div className="grid gap-3 mb-6">
                             {q.options.map((opt: string, idx: number) => (
                                <div key={idx} className={`p-4 rounded-xl text-sm font-bold flex items-center gap-4 ${
                                   idx === q.correctAnswer 
                                   ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' 
                                   : idx === answers[i] && !isCorrect
                                   ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500'
                                   : 'bg-[#18181b] border border-[#27272a] text-gray-500 opacity-60'
                                }`}>
                                   <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] ${
                                      idx === q.correctAnswer ? 'bg-emerald-500 text-white' : idx === answers[i] ? 'bg-rose-500 text-white' : 'bg-[#121214]'
                                   }`}>{String.fromCharCode(65 + idx)}</div>
                                   {opt}
                                </div>
                             ))}
                          </div>

                          <div className="bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
                             <p className="text-[10px] font-black text-pink-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Bot size={14} /> Penjelasan AI</p>
                             <p className="text-sm text-gray-300 leading-relaxed font-medium">{q.explanation}</p>
                          </div>
                       </div>
                    );
                 })}
              </div>
            </div>
         </div>
      </div>
    );
  }

  if (step === 'history') {
     return (
        <div className="flex-1 flex flex-col w-full animate-fade-slide">
           <div className="p-8 md:p-12 bg-[#121214] border-b border-[#27272a] flex items-center justify-between">
              <div>
                 <h2 className="text-2xl font-black text-white tracking-tighter">RIWAYAT <span className="text-pink-500">BELAJARMU</span></h2>
                 <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Lacak progres perkembanganmu</p>
              </div>
              <button onClick={() => setStep('setup')} className="bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/5 transition-all">Kembali</button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-5 md:p-12 custom-scrollbar">
              <div className="max-w-5xl mx-auto space-y-4">
                 {quizHistory.length > 0 ? quizHistory.map((q, idx) => (
                    <div key={idx} className="bg-[#121214] border border-white/5 p-6 md:p-8 rounded-[2.5rem] hover:bg-[#18181b] hover:border-pink-500/40 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group">
                       <div className="flex items-center gap-6 flex-1 min-w-0">
                          <div className={`w-14 h-14 rounded-2xl ${q.score >= 70 ? 'bg-emerald-500/10 text-emerald-500' : q.score >= 40 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'} flex items-center justify-center font-black text-xl shadow-inner`}>
                             {q.score}
                          </div>
                          <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-3 mb-1">
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-3 py-1 bg-white/5 rounded-full border border-white/5">{q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Benar/Salah'}</span>
                                <time className="text-[10px] text-gray-600 font-bold">{q.createdAt?.toDate?.() ? q.createdAt.toDate().toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : 'Baru Saja'}</time>
                             </div>
                             <h4 className="font-extrabold text-white text-lg md:text-xl truncate group-hover:text-pink-500 transition-colors uppercase tracking-tight leading-none">{q.title || 'Kuis Tanpa Judul'}</h4>
                             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">{q.questionCount} Pertanyaan &bull; {Math.round(q.score/100 * q.questionCount)} Benar</p>
                          </div>
                       </div>
                       <div className="flex items-center gap-3 w-full md:w-auto">
                          <button 
                            onClick={() => {
                               setQuestions(q.questions);
                               setAnswers(q.userAnswers || {});
                               setStep('result');
                            }}
                            className="flex-1 md:flex-none bg-white/[0.03] border border-white/5 hover:bg-pink-600 hover:text-white hover:border-pink-500 px-8 py-4 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest transition-all shadow-xl"
                          >
                             Review Hasil
                          </button>
                       </div>
                    </div>
                 )) : (
                    <div className="py-32 flex flex-col items-center justify-center text-center opacity-40">
                       <RotateCcw size={48} className="text-gray-700 mb-6" />
                       <h3 className="text-xl font-black text-gray-500 uppercase tracking-widest">Belum Ada Riwayat</h3>
                       <p className="text-gray-600 mt-4 max-w-xs font-medium">Kerjakan kuis pertamamu untuk mulai melacak progres belajarmu di sini.</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
     );
  }

  return (
    <div className="animate-fade-slide h-full flex flex-col w-full">
      <div className="p-6 md:p-8 mb-6 bg-[#121214] border-b border-[#27272a] shadow-lg">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <h2 className="text-2xl font-black text-white flex items-center gap-3 tracking-tighter">
            <div className="w-12 h-12 rounded-xl bg-pink-600/10 flex items-center justify-center text-pink-500">
               <FileQuestion size={28} />
            </div>
            AI AUTO <span className="text-pink-500">QUIZ</span>
          </h2>
          <div className="flex items-center gap-4">
             <button onClick={() => setStep('history')} className="text-[10px] font-black text-pink-400 hover:text-pink-300 transition-colors uppercase tracking-[0.2em] bg-pink-600/10 px-6 py-3 rounded-full border border-pink-500/20 flex items-center gap-2">
                <Clock size={14} /> RIWAYAT SAYA
             </button>
             <p className="text-xs text-gray-500 font-bold uppercase tracking-widest hidden md:block opacity-60">Uji Pemahaman Secara Instan</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 md:px-12 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mb-8 max-w-7xl mx-auto">
        <div className="space-y-6">
           <div className="bg-[#121214] border border-[#27272a] rounded-[2.5rem] p-6 md:p-10 space-y-8 shadow-xl">
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Pilih Sumber Materi</label>
                <div className="grid grid-cols-1 flex-col sm:grid-cols-2 gap-3 p-1.5 bg-[#18181b] rounded-2xl border border-[#27272a]">
                   <button 
                     onClick={() => setSourceType('file')}
                     className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${sourceType === 'file' ? 'bg-[#09090b] text-pink-500 shadow-lg' : 'text-gray-500 hover:text-white'}`}
                   >
                     <ImageIcon size={18} /> File (PDF/DOCX)
                   </button>
                   <button 
                     onClick={() => setSourceType('link')}
                     className={`py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${sourceType === 'link' ? 'bg-[#09090b] text-pink-500 shadow-lg' : 'text-gray-500 hover:text-white'}`}
                   >
                     <Link2 size={18} /> Tautan / URL
                   </button>
                </div>
              </div>

              {sourceType === 'file' ? (
                <div className="space-y-4">
                   <div 
                     className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-pink-500/5 group ${file ? 'border-pink-500' : 'border-[#27272a] hover:border-pink-500/50'}`}
                     onClick={() => document.getElementById('quiz-file-input')?.click()}
                   >
                      <input 
                        id="quiz-file-input"
                        type="file" 
                        className="hidden" 
                        accept=".pdf,.docx"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                      />
                      <div className={`w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${file ? 'text-pink-500 border-pink-500' : 'text-gray-500'}`}>
                         {file ? <CheckCircle2 size={32} /> : <Plus size={32} />}
                      </div>
                      <p className="font-bold text-white text-sm mb-1">{file ? file.name : "Klik untuk Upload Materi"}</p>
                      <p className="text-xs text-gray-500 font-medium">Maksimal 20MB (PDF atau DOCX)</p>
                   </div>
                </div>
              ) : (
                <div className="space-y-4">
                   <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <input 
                        type="url" 
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="Tempel link artikel, materi, atau website..."
                        className="w-full bg-[#18181b] border border-[#27272a] rounded-2xl pl-12 pr-4 py-4 text-sm text-white focus:outline-none focus:border-pink-500 transition-all font-medium"
                      />
                   </div>
                   <div className="bg-pink-500/5 border border-pink-500/20 p-4 rounded-xl flex items-start gap-3">
                      <Sparkles size={16} className="text-pink-500 mt-0.5 shrink-0" />
                      <p className="text-[10px] leading-relaxed text-pink-400/80 font-medium">Asisten AI akan mencoba membaca konten dari link yang kamu berikan untuk membuat pertanyaan yang relevan.</p>
                   </div>
                </div>
              )}
           </div>

           {error && (
             <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-center gap-3 text-rose-500">
               <X className="shrink-0" size={18} />
               <p className="text-xs font-bold">{error}</p>
             </div>
           )}
        </div>

        <div className="space-y-8">
           <div className="bg-[#121214] border border-[#27272a] rounded-[2.5rem] p-10 space-y-10 shadow-xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-pink-500/5 rounded-full blur-3xl"></div>
              
              <div>
                 <div className="flex justify-between items-center mb-6">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Jumlah Pertanyaan</label>
                    <span className="text-xl font-black text-pink-500">{questionCount}</span>
                 </div>
                 <input 
                    type="range" min="3" max="20" step="1" 
                    value={questionCount}
                    onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-[#18181b] rounded-lg appearance-none cursor-pointer accent-pink-600"
                 />
                 <div className="flex justify-between mt-3 text-[10px] font-bold text-gray-600">
                    <span>3 SOAL</span>
                    <span>20 SOAL</span>
                 </div>
              </div>

              <div>
                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 text-center">Tipe Pertanyaan</label>
                 <div className="grid grid-cols-1 gap-3">
                    <button 
                       onClick={() => setQuizType('multiple_choice')}
                       className={`p-5 rounded-2xl border transition-all flex items-center gap-4 text-left ${quizType === 'multiple_choice' ? 'bg-pink-600 border-pink-600 text-white' : 'bg-[#18181b] border-[#27272a] text-gray-500 hover:border-gray-600 hover:text-white'}`}
                    >
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${quizType === 'multiple_choice' ? 'bg-white/20' : 'bg-[#121214]'}`}>
                          <CheckCircle2 size={16} />
                       </div>
                       <div className="flex-1">
                          <p className="font-bold text-sm">Pilihan Ganda</p>
                          <p className={`text-[10px] ${quizType === 'multiple_choice' ? 'text-white/70' : 'text-gray-600'}`}>Analisis soal lebih dalam</p>
                       </div>
                    </button>
                    <button 
                       onClick={() => setQuizType('true_false')}
                       className={`p-5 rounded-2xl border transition-all flex items-center gap-4 text-left ${quizType === 'true_false' ? 'bg-pink-600 border-pink-600 text-white' : 'bg-[#18181b] border-[#27272a] text-gray-500 hover:border-gray-600 hover:text-white'}`}
                    >
                       <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${quizType === 'true_false' ? 'bg-white/20' : 'bg-[#121214]'}`}>
                          <CheckSquare size={16} />
                       </div>
                       <div className="flex-1">
                          <p className="font-bold text-sm">Benar / Salah</p>
                          <p className={`text-[10px] ${quizType === 'true_false' ? 'text-white/70' : 'text-gray-600'}`}>Uji pemahaman dasar</p>
                       </div>
                    </button>
                 </div>
              </div>

              <button 
                onClick={generateQuiz}
                disabled={isGenerating || (sourceType === 'file' && !file) || (sourceType === 'link' && !linkUrl)}
                className="w-full bg-pink-600 hover:bg-pink-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-pink-900/40 active:scale-95 group"
              >
                {isGenerating ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>BUAT KUIS OTOMATIS</span>
                    <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                  </>
                )}
              </button>
           </div>
        </div>
      </div>
    </div>
   </div>
  );
}

function MemberTimer({ timer }) {
  const [displaySeconds, setDisplaySeconds] = useState(timer?.timeLeft || 0);

  useEffect(() => {
    // If not running, show the stable timeLeft
    if (!timer?.isRunning || !timer?.targetTime) {
      setDisplaySeconds(timer?.timeLeft || 0);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((timer.targetTime - now) / 1000));
      setDisplaySeconds(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer?.isRunning, timer?.targetTime, timer?.timeLeft]);

  const mins = Math.floor(displaySeconds / 60).toString().padStart(2, '0');
  const secs = (displaySeconds % 60).toString().padStart(2, '0');

  return (
    <p className="text-xl font-black text-white tabular-nums">
      {mins}:{secs}
    </p>
  );
}

// ---------------------------------------------------------
// COMPONENT: GROUP ROOM (The Active Session)
// ---------------------------------------------------------
function GroupRoom({ group, onBack, onLeave, onRename, currentUser, userProfile }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMembersMobile, setShowMembersMobile] = useState(false);
  const [newGroupName, setNewGroupName] = useState(group.name);
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- LISTEN TO CHAT ---
  useEffect(() => {
    const q = query(collection(db, 'groups', group.id, 'messages'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Chat listener error:", err);
    });
    return () => unsubscribe();
  }, [group.id]);

  // --- LISTEN TO MEMBERS DATA ---
  useEffect(() => {
    const q = query(collection(db, 'users'), where('__name__', 'in', group.members));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Members listener error:", err);
    });
    return () => unsubscribe();
  }, [group.members]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    const content = inputText.trim();
    setInputText('');

    const messagesPath = `groups/${group.id}/messages`;
    try {
      await addDoc(collection(db, messagesPath), {
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || 'Anonim',
        content,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Send Message Error:", err);
      try {
        const { handleFirestoreError, OperationType } = await import('./firebase');
        handleFirestoreError(err, OperationType.CREATE, messagesPath);
      } catch (logErr) {
        // Fallback if import fails
      }
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(group.code);
    alert("Kode grup disalin ke clipboard!");
  };

  return (
    <div className="animate-fade-slide h-full flex flex-col w-full bg-[#121214] overflow-hidden relative">
      
      {/* ROOM HEADER */}
      <div className="p-5 md:p-6 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between">
         <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-[#121214] rounded-xl text-gray-500 hover:text-white transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
               <h3 className="font-black text-white text-lg flex items-center gap-3">
                 {group.name} 
                 <button onClick={copyCode} className="text-[10px] bg-sky-500/10 text-sky-400 px-3 py-1 rounded-full border border-sky-500/20 flex items-center gap-1.5 hover:bg-sky-500 hover:text-white transition-all uppercase tracking-widest">
                   <Code size={12}/> {group.code} <Share2 size={10} />
                 </button>
               </h3>
               <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2 mt-1">
                 <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> {members.length} Member Aktif Belajar
               </p>
            </div>
         </div>
         <div className="flex gap-2 items-center">
            <button 
              onClick={() => setShowMembersMobile(!showMembersMobile)}
              className={`lg:hidden p-2.5 rounded-xl border transition-all ${showMembersMobile ? 'bg-sky-500 text-white border-sky-500' : 'bg-[#121214] border-[#27272a] text-gray-400 hover:text-white hover:border-gray-600'}`}
              title="Daftar Member"
            >
              <Users size={20} />
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2.5 rounded-xl border transition-all ${showSettings ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-[#121214] border-[#27272a] text-gray-400 hover:text-white hover:border-gray-600'}`}
            >
              <Settings size={20} />
            </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* ROOM SETTINGS OVERLAY */}
        {showSettings && (
           <div className="absolute inset-0 z-50 bg-[#121214]/80 backdrop-blur-md flex items-center justify-center p-6">
              <div className="bg-[#18181b] border border-[#27272a] rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fade-slide">
                 <h3 className="text-xl font-bold text-white mb-6">Pengaturan Grup</h3>
                 <div className="space-y-6">
                    <div>
                       <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Ubah Nama</label>
                       <input 
                         type="text" 
                         value={newGroupName}
                         onChange={(e) => setNewGroupName(e.target.value)}
                         className="w-full bg-[#121214] border border-[#27272a] rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-sky-500 transition-all"
                       />
                       <button 
                        onClick={() => { onRename(newGroupName); setShowSettings(false); }}
                        disabled={newGroupName === group.name}
                        className="mt-3 w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all"
                       >
                         Simpan Perubahan
                       </button>
                    </div>
                    <div className="pt-6 border-t border-[#27272a]">
                       <button 
                        onClick={() => { setShowSettings(false); onLeave(); }}
                        className="w-full bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500 hover:text-white font-bold py-3 rounded-xl transition-all"
                       >
                         Keluar dari Grup
                       </button>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="w-full text-xs font-black text-gray-500 hover:text-white uppercase tracking-[0.3em] pt-4">Tutup</button>
                 </div>
              </div>
           </div>
        )}

        {/* LEFT: MEMBER LIST & STATUS */}
        <div className={`
          ${showMembersMobile ? 'fixed inset-0 z-40 bg-[#121214] flex' : 'hidden'} 
          lg:static lg:flex w-full lg:w-72 md:lg:80 border-r border-[#27272a] bg-[#18181b]/50 overflow-y-auto flex-col p-6 space-y-6
        `}>
           <div className="flex justify-between items-center lg:block">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Live Progress Member</h4>
              <button className="lg:hidden p-2 text-gray-400" onClick={() => setShowMembersMobile(false)}><X size={20}/></button>
           </div>
           <div className="space-y-4">
              {members.map(member => (
                 <div key={member.uid} className="bg-[#121214] border border-[#27272a] rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden group">
                    <div className={`absolute top-0 right-0 w-1.5 h-full ${member.currentTimer?.isRunning ? 'bg-indigo-500 animate-pulse' : 'bg-gray-700'}`}></div>
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-[#18181b] border border-[#27272a] p-0.5 overflow-hidden">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.uid}`} className="w-full h-full" />
                       </div>
                       <div className="overflow-hidden">
                          <p className="text-sm font-bold text-white truncate">{member.displayName}</p>
                          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Streak: {member.currentStreak || 0} Hari</p>
                       </div>
                    </div>
                    
                    <div className="bg-[#18181b] rounded-xl p-3 border border-[#27272a] space-y-2">
                       <div className="flex justify-between items-center text-[9px] font-black text-gray-500 uppercase">
                          <span>Focus Status</span>
                          <span className={member.currentTimer?.isRunning ? 'text-indigo-400' : ''}>
                            {member.currentTimer?.isRunning ? 'BERJALAN' : 'STANDBY'}
                          </span>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${member.currentTimer?.mode === 'focus' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                             {member.currentTimer?.mode === 'focus' ? <BrainCircuit size={16}/> : <Coffee size={16}/>}
                          </div>
                          <div className="flex-1">
                             <MemberTimer timer={member.currentTimer} />
                          </div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* RIGHT: CHAT SYSTEM */}
        <div className="flex-1 flex flex-col bg-[#09090b]/40">
           <div 
             ref={scrollRef}
             className="flex-1 overflow-y-auto p-5 md:p-8 custom-scrollbar space-y-4"
           >
              {messages.map((msg, i) => (
                 <div key={msg.id} className={`flex flex-col ${msg.isSystem ? 'items-center py-2' : msg.senderId === currentUser.uid ? 'items-end' : 'items-start'} animate-fade-slide`}>
                    {msg.isSystem ? (
                      <div className="bg-[#18181b] border border-[#27272a] px-4 py-1.5 rounded-full">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          <Info size={12} className="text-gray-600" /> {msg.content}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1 px-2">
                           {msg.senderId !== currentUser.uid && <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{msg.senderName}</span>}
                        </div>
                        <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-3 md:px-4 md:py-3 shadow-sm ${
                           msg.senderId === currentUser.uid 
                           ? 'bg-sky-600 text-white rounded-tr-none' 
                           : 'bg-[#18181b] border border-[#27272a] text-gray-200 rounded-tl-none'
                        }`}>
                           {msg.type === 'file' ? (
                              <div className="flex items-center gap-3 py-1">
                                 <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
                                    <FolderOpen size={20} className={msg.senderId === currentUser.uid ? 'text-sky-200' : 'text-indigo-400'} />
                                 </div>
                                 <div className="flex-1 overflow-hidden">
                                    <p className="text-xs font-bold truncate">{msg.fileName || 'File'}</p>
                                    <a 
                                       href={msg.fileUrl} 
                                       download={msg.fileName}
                                       className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 mt-1 hover:underline ${msg.senderId === currentUser.uid ? 'text-sky-200' : 'text-indigo-400'}`}
                                    >
                                       Download <ExternalLink size={10} />
                                    </a>
                                 </div>
                              </div>
                           ) : (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                           )}
                        </div>
                      </>
                    )}
                 </div>
              ))}
           </div>

           <div className="p-4 md:p-6 bg-[#18181b] border-t border-[#27272a]">
              <div className="flex gap-2">
                 <input 
                    type="file" 
                    id="file-upload" 
                    hidden 
                    onChange={async (e) => {
                       const file = e.target.files?.[0];
                       if (!file) return;
                       if (file.size > 750000) {
                          alert("File terlalu besar (maksimal 750KB untuk grup chat).");
                          return;
                       }
                       const reader = new FileReader();
                       reader.readAsDataURL(file);
                       reader.onloadend = async () => {
                          const base64 = reader.result;
                          try {
                             await addDoc(collection(db, `groups/${group.id}/messages`), {
                                senderId: currentUser.uid,
                                senderName: userProfile?.displayName || currentUser.displayName || 'Member',
                                content: null,
                                fileUrl: base64,
                                fileName: file.name,
                                type: 'file',
                                timestamp: serverTimestamp()
                             });
                          } catch (err) {
                             console.error("Upload Error:", err);
                             alert("Gagal mengirim file.");
                          }
                       };
                    }}
                 />
                 <label 
                    htmlFor="file-upload"
                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#121214] border border-[#27272a] text-gray-400 hover:text-white cursor-pointer transition-all shadow-lg active:scale-95"
                 >
                    <Plus size={22} />
                 </label>
                 <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                    <input 
                       type="text" 
                       value={inputText}
                       onChange={(e) => setInputText(e.target.value)}
                       placeholder="Ngobrol bareng member..."
                       className="flex-1 bg-[#121214] border border-[#27272a] rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-sky-500 transition-all font-medium text-sm"
                    />
                    <button 
                       type="submit" 
                       disabled={!inputText.trim()}
                       className="w-12 h-12 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95"
                    >
                       <Send size={20} />
                    </button>
                 </form>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// REUSABLE UI: MODAL
// ---------------------------------------------------------
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-[#121214] border border-[#27272a] rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-fade-slide">
         <div className="flex justify-between items-center p-8 border-b border-[#27272a]">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">{title}</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-rose-500 transition-all"><X size={24}/></button>
         </div>
         <div className="p-8">
            {children}
         </div>
      </div>
    </div>
  );
}

// ==========================================
// KOMPONEN: AI ASSISTANT VIEW
// ==========================================
function AIAssistantView({ sessions, setSessions, activeSessionId, setActiveSessionId, isLoading, setIsLoading, tasks }) {
  const [inputText, setInputText] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [activeSession.messages, isLoading]);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedImage) || isLoading) return;

    const userMessage = inputText.trim();
    const currentImage = selectedImage;
    setInputText('');
    setSelectedImage(null);
    
    const updatedSessions = sessions.map(s => {
      if (s.id === activeSessionId) {
        const newMessage = { 
          role: 'user', 
          content: userMessage || (currentImage ? "Menganalisis gambar ini..." : ""),
          image: currentImage 
        };
        return { ...s, messages: [...s.messages, newMessage] };
      }
      return s;
    });
    setSessions(updatedSessions);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const currentTasksContext = tasks.map(t => `- ${t.title} (${t.status}, Deadline: ${t.dueDate})`).join('\n');
      
      const textPart = {
        text: `
          Kamu adalah asisten AI RuangFokus, asisten belajar pribadi yang ramah, memotivasi, dan cerdas.
          Bantu pelajar dengan pertanyaan mereka, penjelasan materi, atau tips produktivitas.
          Gunakan gaya bahasa santai tapi sopan (Gaya Indonesia).
          
          Konteks Tugas Pengguna Saat Ini:
          ${currentTasksContext || 'Tidak ada tugas aktif.'}

          Pertanyaan Pengguna: ${userMessage || 'Tolong jelaskan gambar ini.'}
        `
      };

      const contents: any[] = [textPart];
      if (currentImage) {
        const base64Data = currentImage.split(',')[1];
        const mimeType = currentImage.split(';')[0].split(':')[1];
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts: contents },
      });
      
      const text = response.text;

      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, messages: [...s.messages, { role: 'assistant', content: text || "Maaf, saya tidak bisa memberikan jawaban saat ini." }] };
        }
        return s;
      }));
    } catch (error) {
      console.error("AI Error:", error);
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return { ...s, messages: [...s.messages, { role: 'assistant', content: "Maaf, sepertinya ada kendala teknis saat menghubungi otak AI saya. Coba lagi nanti ya!" }] };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 2 * 1024 * 1024) {
      alert("Gambar terlalu besar (maksimal 2MB).");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const createNewSession = () => {
    const newSession = {
      id: Date.now().toString(),
      title: 'Chat Baru',
      messages: [{ role: 'assistant', content: 'Halo! Ada yang bisa saya bantu sekarang?' }]
    };
    setSessions([newSession, ...sessions]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      return;
    }
    const filtered = sessions.filter(s => s.id !== id);
    setSessions(filtered);
    if (activeSessionId === id) setActiveSessionId(filtered[0].id);
  };

  const startRenaming = (e, session) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const saveRename = (e) => {
    e.preventDefault();
    if (!editTitle.trim()) return;
    setSessions(sessions.map(s => s.id === editingSessionId ? { ...s, title: editTitle } : s));
    setEditingSessionId(null);
  };

  return (
    <div className="animate-fade-slide flex-1 h-full flex bg-[#121214] relative overflow-hidden">
      
      {/* Sidebar History */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-40 bg-[#18181b] border-r border-[#27272a] flex flex-col transition-all duration-300 md:shadow-none shadow-2xl
          md:relative md:translate-x-0 shrink-0
          ${isHistoryOpen ? 'w-[75vw] sm:w-64 md:w-72 translate-x-0' : 'w-0 -translate-x-full overflow-hidden'}
        `}
      >
        <div className="p-5 md:p-6 border-b border-[#27272a] flex items-center justify-between">
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Riwayat Chat</h4>
          <div className="flex gap-2">
            <button onClick={createNewSession} className="p-2.5 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-md active:scale-90" title="Chat Baru">
              <Plus size={20} />
            </button>
            <button onClick={() => setIsHistoryOpen(false)} className="md:hidden p-2 text-gray-500 hover:text-white"><X size={20}/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 space-y-2">
          {sessions.map(session => (
            <div 
              key={session.id} 
              onClick={() => setActiveSessionId(session.id)}
              className={`group p-3 rounded-xl cursor-pointer border transition-all flex items-center justify-between gap-2 ${activeSessionId === session.id ? 'bg-indigo-600/20 border-indigo-500/50 text-white' : 'bg-[#121214] border-[#27272a] text-gray-400 hover:border-gray-600'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <Bot size={16} className={activeSessionId === session.id ? 'text-indigo-400' : 'text-gray-600'} />
                {editingSessionId === session.id ? (
                  <form onSubmit={saveRename} onClick={e => e.stopPropagation()}>
                    <input 
                      autoFocus
                      value={editTitle} 
                      onChange={e => setEditTitle(e.target.value)} 
                      onBlur={saveRename}
                      className="bg-[#09090b] border border-indigo-500 text-xs py-1 px-2 rounded outline-none w-full"
                    />
                  </form>
                ) : (
                  <span className="text-xs font-bold truncate">{session.title}</span>
                )}
              </div>
              <div className={`flex items-center gap-2 transition-all ${activeSessionId === session.id ? 'opacity-100' : 'opacity-60 md:opacity-0 group-hover:opacity-100'}`}>
                <button onClick={(e) => startRenaming(e, session)} className="p-2 hover:text-indigo-400" title="Ubah Nama"><Pencil size={14}/></button>
                <button onClick={(e) => deleteSession(e, session.id)} className="p-2 hover:text-rose-500" title="Hapus Chat"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#09090b]/20 relative overflow-hidden">
        {/* Mobile History Backdrop */}
        {isHistoryOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden transition-opacity" 
            onClick={() => setIsHistoryOpen(false)}
          />
        )}

        <div className="p-4 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between relative z-10">
           <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
              <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)} 
                className={`p-2 rounded-lg transition-all ${isHistoryOpen ? 'text-indigo-400 bg-indigo-400/10' : 'text-gray-500 hover:text-white hover:bg-[#121214]'}`} 
                title="Riwayat Chat"
              >
                <Menu size={20} />
              </button>
              <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30 flex-shrink-0">
                  <Bot size={18} />
                </div>
                <div className="overflow-hidden">
                   <h3 className="font-bold text-white text-xs md:text-sm truncate">{activeSession.title}</h3>
                   <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Online</p>
                </div>
              </div>
           </div>
           <div className="hidden sm:flex items-center gap-2 bg-[#121214] border border-[#27272a] px-3 py-1 rounded-lg text-[10px] font-bold text-gray-500">
              <Sparkle size={12} className="text-amber-400"/> Gemini 3.1 Pro
           </div>
        </div>

        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar space-y-5 md:space-y-6 bg-[#09090b]/30"
        >
           {activeSession.messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-slide`}>
                 <div className={`max-w-[90%] md:max-w-[75%] lg:max-w-[70%] rounded-2xl md:rounded-[2rem] p-4 md:p-6 shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-indigo-900/40' 
                    : 'bg-[#18181b] border border-[#27272a] text-gray-200 rounded-tl-none'
                 }`}>
                    {msg.image && (
                       <div className="mb-3 rounded-2xl overflow-hidden border border-white/5 bg-black/40 group relative aspect-video flex items-center justify-center">
                          <img 
                            src={msg.image} 
                            className="w-full h-full object-contain cursor-zoom-in hover:scale-105 transition-transform duration-500" 
                            alt="Visual Context"
                            onClick={() => window.open(msg.image, '_blank')}
                          />
                          <div className="absolute top-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest text-white/50 opacity-0 group-hover:opacity-100 transition-opacity">
                             Image Attached
                          </div>
                       </div>
                    )}
                    <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                 </div>
              </div>
           ))}
           {isLoading && (
              <div className="flex justify-start animate-fade-slide">
                 <div className="bg-[#18181b] border border-[#27272a] rounded-2xl rounded-tl-none p-4 flex items-center gap-3">
                    <div className="flex gap-1">
                       <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></span>
                       <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                       <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">AI Sedang Berpikir</span>
                 </div>
              </div>
           )}
        </div>

        <div className="p-4 md:p-6 bg-[#18181b] border-t border-[#27272a]">
            {selectedImage && (
               <div className="mb-4 flex items-center gap-3 bg-[#121214] p-2 rounded-xl border border-indigo-500/30 w-fit">
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                     <img src={selectedImage} className="w-full h-full object-cover" alt="Selected" />
                     <button 
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-0 right-0 bg-rose-600 text-white p-1 rounded-bl-lg"
                     >
                        <X size={12} />
                     </button>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Gambar Terpilih</span>
               </div>
            )}
            <form onSubmit={handleSendMessage} className="flex gap-3">
               <div className="flex-1 relative">
                  <input 
                     type="text" 
                     value={inputText}
                     onChange={(e) => setInputText(e.target.value)}
                     placeholder="Ketik pertanyaan atau jelaskan gambar..."
                     className="w-full bg-[#121214] border border-[#27272a] rounded-2xl pl-5 pr-12 py-3.5 text-white focus:outline-none focus:border-indigo-500 transition-all font-medium text-sm md:text-base"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                     <label className="p-2 text-gray-400 hover:text-indigo-400 cursor-pointer transition-colors" title="Ambil Foto">
                        <Camera size={20} />
                        <input 
                           type="file" 
                           accept="image/*" 
                           capture="environment"
                           className="hidden" 
                           onChange={handleImageChange}
                        />
                     </label>
                     <label className="p-2 text-gray-400 hover:text-indigo-400 cursor-pointer transition-colors" title="Unggah Gambar">
                        <ImageIcon size={20} />
                        <input 
                           type="file" 
                           accept="image/*" 
                           className="hidden" 
                           onChange={handleImageChange}
                        />
                     </label>
                  </div>
               </div>
               <button 
                  type="submit" 
                  disabled={isLoading || (!inputText.trim() && !selectedImage)}
                  className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-indigo-900/40 active:scale-95"
               >
                  <Send size={24} />
               </button>
            </form>
            <p className="text-center text-[9px] text-gray-600 mt-4 font-bold uppercase tracking-widest">Powered by Gemini 3 Flash Vision</p>
         </div>
      </div>
    </div>
  );
}

// ==========================================
// KOMPONEN: RESOURCES VIEW (LACI MATERI)
// ==========================================
function ResourcesView({ resources, setResources }) {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newResName, setNewResName] = useState('');
  const [newResUrl, setNewResUrl] = useState('');
  const [newResSubject, setNewResSubject] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const subjects = Array.from(new Set(resources.map(r => r.subject)));

  const handleAddResource = (e) => {
    e.preventDefault();
    if (!newResName || !newResUrl || !newResSubject) return;
    
    setResources([...resources, { id: Date.now(), name: newResName, url: newResUrl, subject: newResSubject }]);
    setNewResName('');
    setNewResUrl('');
    setNewResSubject('');
    setIsModalOpen(false);
  };

  const deleteResource = (id) => {
    const updated = resources.filter(r => r.id !== id);
    setResources(updated);
  };

  const deleteSubject = (subjectName) => {
    const updated = resources.filter(r => r.subject !== subjectName);
    setResources(updated);
  };

  return (
    <div className="animate-fade-slide h-full flex flex-col max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
         <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
               <Library className="text-emerald-500" /> Laci Materi Kelas
            </h2>
            <p className="text-sm text-gray-500 mt-1">Simpan dan akses semua referensi belajarmu di satu tempat.</p>
         </div>
         <button onClick={() => { setNewResSubject(''); setIsModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 active:scale-95">
            <Plus size={20} /> Simpan Materi
         </button>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {subjects.length > 0 ? subjects.map(subject => {
             const subjectResources = resources.filter(r => r.subject === subject);
             return (
                <div 
                  key={subject} 
                  onClick={() => { setSelectedSubject(subject); setSearchQuery(''); }}
                  className="bg-[#121214] border border-white/5 rounded-[3rem] overflow-hidden flex flex-col cursor-pointer hover:border-emerald-500/40 transition-all group hover:bg-[#18181b] shadow-2xl"
                >
                   <div className="p-8 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-6">
                         <div className="w-16 h-16 rounded-[1.8rem] bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-xl group-hover:rotate-6">
                            <FolderOpen size={32} />
                         </div>
                         <div>
                            <h3 className="font-black text-white uppercase tracking-[0.2em] text-lg">{subject}</h3>
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] mt-1">{subjectResources.length} Materi Tersimpan</p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button 
                           onClick={(e) => { e.stopPropagation(); deleteSubject(subject); }}
                           className="p-3 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all"
                           title="Hapus Folder"
                         >
                            <Trash2 size={20} />
                         </button>
                         <ChevronRight className="text-gray-700 group-hover:text-emerald-500 transition-all translate-x-0 group-hover:translate-x-1" />
                      </div>
                   </div>
                   <div className="p-12 flex-1 flex flex-col justify-center items-center text-center space-y-6">
                      <div className="flex -space-x-4 overflow-hidden mb-2">
                         {subjectResources.slice(0, 5).map(res => (
                            <div key={res.id} className="inline-block h-12 w-12 rounded-2xl ring-4 ring-[#121214] bg-[#18181b] flex items-center justify-center text-gray-400 border border-white/5 shadow-2xl group-hover:scale-110 transition-transform">
                               {res.url.includes('youtube') ? <Play size={18}/> : <Link2 size={18}/>}
                            </div>
                         ))}
                         {subjectResources.length > 5 && (
                            <div className="inline-block h-12 w-12 rounded-2xl ring-4 ring-[#121214] bg-[#18181b] flex items-center justify-center text-[11px] font-black text-gray-500 border border-white/5 shadow-2xl">
                               +{subjectResources.length - 5}
                            </div>
                         )}
                      </div>
                      <div className="px-8 py-3 bg-white/5 rounded-full border border-white/5 text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] group-hover:text-emerald-400 group-hover:border-emerald-500/20 transition-all">Pilih Folder & Lihat Detail</div>
                   </div>
                </div>
             );
          }) : (
             <div className="col-span-full py-32 bg-[#121214] border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center justify-center text-center opacity-40">
                <Library size={64} className="text-gray-700 mb-6" />
                <h3 className="text-2xl font-black text-gray-500 uppercase tracking-widest">Laci Masih Kosong</h3>
                <p className="text-gray-600 mt-4 max-w-sm font-medium leading-relaxed">Simpan tautan penting, materi kuliah, atau video pembelajaran di sini untuk manajemen belajar yang lebih rapi.</p>
             </div>
          )}
       </div>

      {/* POPUP DETAIL MATERI */}
      {selectedSubject && (
         <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4 md:p-8">
            <div className="bg-[#09090b] border border-[#27272a] rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-fade-slide">
               <div className="p-6 md:p-8 border-b border-[#27272a] bg-[#121214] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                     <button onClick={() => setSelectedSubject(null)} className="p-2 hover:bg-[#18181b] rounded-xl text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft />
                     </button>
                     <div>
                        <div className="flex items-center gap-2 text-emerald-500 mb-1">
                           <FolderOpen size={16} />
                           <span className="text-[10px] font-black uppercase tracking-[0.2em]">Mata Pelajaran</span>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tight">{selectedSubject}</h3>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                        <input 
                           type="text" 
                           placeholder="Cari materi..." 
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           className="w-full bg-[#18181b] border border-[#27272a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-medium"
                        />
                     </div>
                     <button 
                        onClick={() => { setNewResSubject(selectedSubject); setIsModalOpen(true); }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-900/40"
                     >
                        <Plus />
                     </button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {resources
                        .filter(r => r.subject === selectedSubject && r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(res => (
                           <div key={res.id} className="group bg-[#121214] border border-[#27272a] p-5 rounded-2xl flex items-center justify-between hover:border-emerald-500 transition-all">
                              <a href={res.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 overflow-hidden flex-1">
                                 <div className="w-12 h-12 rounded-xl bg-[#09090b] group-hover:bg-emerald-500/10 flex items-center justify-center text-gray-500 group-hover:text-emerald-500 transition-all shadow-inner">
                                    {res.url.includes('youtube.com') || res.url.includes('youtu.be') ? <Play size={20}/> : (res.url.includes('drive.google.com') || res.url.includes('docs.google.com')) ? <Globe size={20}/> : <Link2 size={20} />}
                                 </div>
                                 <div className="overflow-hidden">
                                    <p className="text-base font-bold text-gray-200 group-hover:text-white transition-colors truncate">{res.name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                       <Hash size={10} className="text-gray-600" />
                                       <p className="text-[10px] text-gray-500 truncate font-mono">{res.url}</p>
                                    </div>
                                 </div>
                              </a>
                              <div className="flex items-center gap-3">
                                 <a href={res.url} target="_blank" rel="noopener noreferrer" className="p-2.5 text-gray-500 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all" title="Buka Link">
                                    <ExternalLink size={18} />
                                 </a>
                                 <button 
                                   onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteResource(res.id); }} 
                                   className="p-2.5 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all opacity-100 md:opacity-40 group-hover:opacity-100" 
                                   title="Hapus Materi"
                                 >
                                    <Trash2 size={18} />
                                 </button>
                              </div>
                           </div>
                        ))}
                     {resources.filter(r => r.subject === selectedSubject && r.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-40">
                           <Search size={48} className="text-gray-700 mb-4" />
                           <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Materi tidak ditemukan</p>
                        </div>
                     )}
                  </div>
               </div>
               
               <div className="p-6 border-t border-[#27272a] bg-[#121214] flex justify-center">
                  <button onClick={() => setSelectedSubject(null)} className="text-xs font-black text-gray-600 hover:text-white uppercase tracking-[0.3em] transition-colors">Tutup Folder</button>
               </div>
            </div>
         </div>
      )}

      {isModalOpen && (
         <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-[#121214] border border-[#27272a] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-slide">
               <div className="p-6 border-b border-[#27272a] flex justify-between items-center text-white">
                  <h3 className="text-xl font-bold">Simpan Materi Baru</h3>
                  <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-rose-500"><X /></button>
               </div>
               <form onSubmit={handleAddResource} className="p-6 space-y-5">
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Mata Pelajaran</label>
                     <input list="subjects-list" value={newResSubject} onChange={e => setNewResSubject(e.target.value)} placeholder="Contoh: Matematika, Fisika, Sejarah..." required
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all" />
                     <datalist id="subjects-list">
                        {subjects.map(s => <option key={s} value={s} />)}
                     </datalist>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Nama Materi</label>
                     <input value={newResName} onChange={e => setNewResName(e.target.value)} placeholder="Contoh: PDF Bab 1 Aljabar" required
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all" />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">URL Tautan (Link)</label>
                     <input value={newResUrl} onChange={e => setNewResUrl(e.target.value)} placeholder="https://..." required
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-all" />
                  </div>
                  <div className="pt-2 flex flex-col gap-3">
                     <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-95">
                        Simpan Materi
                     </button>
                     <button type="button" onClick={() => setIsModalOpen(false)} className="w-full text-gray-500 font-bold py-2 hover:text-white transition-colors">Batal</button>
                  </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
}
