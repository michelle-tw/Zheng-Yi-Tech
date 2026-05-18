import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  Clock, 
  Eye, 
  EyeOff, 
  User, 
  ShieldCheck, 
  ShieldAlert, 
  Edit3, 
  Check, 
  X,
  History,
  Ban,
  UserCheck,
  Trash2,
  Key,
  ChevronDown
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, UserRole, TimesheetEntry, Project } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { cn, handleFirestoreError, OperationType, formatTimeAgo } from '../lib/utils';
import { logAction } from '../services/auditService';

type SortOption = 'name' | 'hours_desc' | 'hours_asc';

export default function CompanyDirectory({ initialSearchTerm }: { initialSearchTerm?: string }) {
  const { t, i18n } = useTranslation();
  const { isAdmin, isSuperAdmin, profile: currentUser } = useAuth();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  
  const [editingFullname, setEditingFullname] = useState<{ id: string, value: string } | null>(null);
  const [viewingHistory, setViewingHistory] = useState<UserProfile | null>(null);

  // Auto-select worker if name is passed from dashboard
  useEffect(() => {
    if (initialSearchTerm && employees.length > 0) {
      const found = employees.find(e => 
        e.full_name?.toLowerCase() === initialSearchTerm.toLowerCase() || 
        e.username?.toLowerCase() === initialSearchTerm.toLowerCase()
      );
      if (found) {
        setViewingHistory(found);
      }
    }
  }, [initialSearchTerm, employees]);

  const [resettingPassword, setResettingPassword] = useState<{ id: string, username: string } | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const isOnline = (user: UserProfile) => {
    if (!user.last_active_at) return false;
    const lastActive = user.last_active_at.toMillis ? user.last_active_at.toMillis() : new Date(user.last_active_at).getTime();
    return (Date.now() - lastActive) < 7 * 60 * 1000; // 7 minutes buffer for 3 min interval
  };

  // 1. Fetch Users
  useEffect(() => {
    if (!db || !currentUser) return;
    
    // Everyone can view, but filtering is done in JS to respect super admin privacy
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setEmployees(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 1.1 Fetch Worker Names (Legacy/Manual workers without accounts)
  useEffect(() => {
    if (!db) return;
    const unsubscribe = onSnapshot(collection(db, 'worker_names'), (snapshot) => {
      const names = snapshot.docs.map(doc => doc.data().name as string).filter(n => n !== '施杰倫');
      const initialNames = ['羅善文', '黃銘宗', '李柏翰', '張育祥', '謝鴻宇', '魏士鈞', '施杰綸', '梁寶銘'];
      setWorkerNames(Array.from(new Set([...initialNames, ...names])));
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Projects (for current project name mapping)
  useEffect(() => {
    if (!db) return;
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const map: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as Project;
        map[doc.id] = data.name;
      });
      setProjects(map);
    });
    return () => unsubscribe();
  }, []);

  // 3. Fetch Timesheets (to calculate hours and current project)
  useEffect(() => {
    if (!db) return;
    // We only need APPROVED ones for hours calculation usually, but maybe all for "current" work
    const unsubscribe = onSnapshot(collection(db, 'timesheets'), (snapshot) => {
      setTimesheets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });
    return () => unsubscribe();
  }, []);

  // 4. Calculate Stats per Employee
  const employeeStats = useMemo(() => {
    const stats: Record<string, { totalHours: number, currentProject: string, lastDate: string, lastTimestamp: number }> = {};
    
    // Create a name-to-uid map for quick lookup
    const nameToUid: Record<string, string> = {};
    employees.forEach(emp => {
      if (emp.full_name) nameToUid[emp.full_name] = emp.uid;
    });

    timesheets.forEach(ts => {
      // Prioritize full name mapping, then user_id, fallback to full_name
      let key = ts.user_id || ts.full_name || 'unknown';
      if (ts.full_name && nameToUid[ts.full_name]) {
        key = nameToUid[ts.full_name];
      }
      
      if (key === 'unknown') return;

      if (!stats[key]) {
        stats[key] = { totalHours: 0, currentProject: '', lastDate: '', lastTimestamp: 0 };
      }
      
      // Only count APPROVED hours in total
      if (ts.status === 'APPROVED') {
        const hours = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
        stats[key].totalHours += hours;
      }

      // Track most recent project more accurately using date and timestamp
      const tsTime = ts.created_at ? (ts.created_at.toMillis ? ts.created_at.toMillis() : new Date(ts.created_at).getTime()) : 0;
      
      if (ts.date > stats[key].lastDate || (ts.date === stats[key].lastDate && tsTime > stats[key].lastTimestamp)) {
        stats[key].lastDate = ts.date;
        stats[key].lastTimestamp = tsTime;
        stats[key].currentProject = projects[ts.project_id] || ts.project_id || '';
      }
    });
    
    return stats;
  }, [timesheets, projects, t, employees]);

  const employeeMonthlyHours = useMemo(() => {
    if (!viewingHistory) return 0;
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    return timesheets
      .filter(ts => 
        (ts.user_id === viewingHistory.uid || ts.full_name === viewingHistory.full_name) && 
        ts.date.startsWith(currentMonthPrefix)
      )
      .reduce((sum, ts) => sum + (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0), 0);
  }, [viewingHistory, timesheets]);

  const employeeProjectStats = useMemo(() => {
    if (!viewingHistory) return [];
    
    const records = timesheets.filter(ts => (ts.user_id === viewingHistory.uid || ts.full_name === viewingHistory.full_name));
    const projectMap: Record<string, { total: number, tasks: Record<string, number> }> = {};
    
    records.forEach(ts => {
      const projId = ts.project_id;
      const hours = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
      const task = ts.work_content || t('other');
      
      if (!projectMap[projId]) {
        projectMap[projId] = { total: 0, tasks: {} };
      }
      
      projectMap[projId].total += hours;
      projectMap[projId].tasks[task] = (projectMap[projId].tasks[task] || 0) + hours;
    });
    
    return Object.entries(projectMap).map(([id, data]) => ({
      id,
      name: projects[id] || t('unknown_project'),
      ...data
    })).sort((a, b) => b.total - a.total);
  }, [viewingHistory, timesheets, projects, t]);

  // Actions
  const handleDeleteUser = async () => {
    if (!db || !currentUser || !isSuperAdmin || !deletingUser) return;
    if (deletingUser.uid === currentUser.uid) return;
    
    setUpdatingUser(deletingUser.uid);
    try {
      await deleteDoc(doc(db, 'users', deletingUser.uid));
      await logAction(currentUser.username, currentUser.role, 'DELETE_USER', deletingUser.uid, deletingUser.username);
      setDeletingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${deletingUser.uid}`);
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleResetPassword = async () => {
    if (!db || !currentUser || !isSuperAdmin || !resettingPassword) return;
    if (!newPassword.trim()) return;

    try {
      await updateDoc(doc(db, 'users', resettingPassword.id), {
        password: newPassword,
        updated_at: new Date()
      });
      await logAction(currentUser.username, currentUser.role, 'RESET_PASSWORD', resettingPassword.id, resettingPassword.username);
      setResettingPassword(null);
      setNewPassword('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${resettingPassword.id}`);
    }
  };

  const handleUpdateUser = async (uid: string, data: Partial<UserProfile>) => {
    if (!db || !currentUser || !isAdmin) return;
    setUpdatingUser(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        ...data,
        updated_at: new Date()
      });
      await logAction(currentUser.username, currentUser.role, 'UPDATE_USER_INFO', uid, employees.find(e => e.uid === uid)?.username || 'user', data);
      setEditingFullname(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleUpdateEmployeeName = async (emp: any) => {
    if (!db || !currentUser || !isAdmin) return;
    if (!editingFullname || !editingFullname.value.trim()) return;
    if (!window.confirm(t('confirm_edit_employee'))) return;
    
    setUpdatingUser(emp.uid);
    try {
      const { writeBatch, getDocs, query, collection, where, doc, updateDoc, addDoc, serverTimestamp, deleteDoc } = await import('firebase/firestore');
      
      const newName = editingFullname.value.trim();
      const oldName = emp.full_name;

      if (emp.isUnregistered) {
        // Update worker_names
        const q = query(collection(db, 'worker_names'), where('name', '==', oldName));
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(doc(db, 'worker_names', snap.docs[0].id), { name: newName });
        } else {
          await addDoc(collection(db, 'worker_names'), { name: newName, created_at: serverTimestamp() });
        }
      } else {
        await updateDoc(doc(db, 'users', emp.uid), {
          full_name: newName,
          updated_at: new Date()
        });
      }

      // Update in timesheets
      const batch = writeBatch(db);
      
      if (!emp.isUnregistered) {
        const tsQueryByUid = query(collection(db, 'timesheets'), where('user_id', '==', emp.uid));
        const tsSnapByUid = await getDocs(tsQueryByUid);
        tsSnapByUid.forEach(d => {
          batch.update(d.ref, { full_name: newName });
        });
      }

      const tsQueryByName = query(collection(db, 'timesheets'), where('full_name', '==', oldName));
      const tsSnapByName = await getDocs(tsQueryByName);
      tsSnapByName.forEach(d => {
        batch.update(d.ref, { full_name: newName });
        if (d.data().user_id === 'public-' + oldName) {
          batch.update(d.ref, { user_id: 'public-' + newName });
        }
      });
      
      await batch.commit();

      setEditingFullname(null);
      setTimeout(() => alert(t('update_success')), 100);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleDeleteEmployee = async (emp: any) => {
    if (!db || !currentUser || !isAdmin) return;
    if (emp.uid === currentUser.uid) return;
    if (!window.confirm(t('confirm_delete_employee'))) return;

    setUpdatingUser(emp.uid);
    try {
      const { writeBatch, getDocs, query, collection, where, deleteDoc, doc } = await import('firebase/firestore');

      if (emp.isUnregistered) {
        const q = query(collection(db, 'worker_names'), where('name', '==', emp.full_name));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => {
           batch.delete(d.ref);
        });
        await batch.commit();
      } else {
        await deleteDoc(doc(db, 'users', emp.uid));
        await logAction(currentUser.username, currentUser.role, 'DELETE_USER', emp.uid, emp.username);
      }
      
      setTimeout(() => alert(t('delete_success')), 100);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  };

  const toggleAdmin = async (target: UserProfile) => {
    if (!isSuperAdmin) return; // Only super admins can grant/revoke admin status
    const newRole = target.role === UserRole.ADMIN ? UserRole.EMPLOYEE : UserRole.ADMIN;
    await handleUpdateUser(target.uid, { role: newRole });
  };

  const toggleStatus = async (target: UserProfile) => {
    await handleUpdateUser(target.uid, { is_active: !target.is_active });
  };

  // Filter & Sort
  const processedEmployees = useMemo(() => {
    // Start with real users
    const userMap: Record<string, boolean> = {};
    const baseList: any[] = employees.map(emp => {
      userMap[emp.full_name || ''] = true;
      return { ...emp, id: emp.uid };
    });

    // Add extra names from worker_names and timesheets
    const extraNamesFromTS = Array.from(new Set(timesheets.map(ts => ts.full_name))).filter(Boolean) as string[];
    const allUniqueNames = Array.from(new Set([...workerNames, ...extraNamesFromTS]));

    allUniqueNames.forEach(name => {
      if (!userMap[name]) {
        baseList.push({
          uid: name, // Use name as ID for non-users
          id: name,
          full_name: name,
          username: '-',
          role: UserRole.EMPLOYEE,
          is_active: true,
          isUnregistered: true
        });
      }
    });

    const filtered = baseList.filter(emp => {
      // Logic: Super admins and the default public admin account should be hidden
      // as they are not real company employees.
      if (
        emp.role === UserRole.SUPER_ADMIN || 
        emp.uid === 'public-admin' || 
        emp.username === 'admin' || 
        emp.username === 'zhengyitech' || 
        emp.full_name?.toLowerCase().includes('public administrator')
      ) return false;
      
      const searchStr = searchTerm.toLowerCase();
      return emp.full_name?.toLowerCase().includes(searchStr) || 
             emp.username?.toLowerCase().includes(searchStr);
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.full_name || '').localeCompare(b.full_name || '');
      }
      const hoursA = employeeStats[a.uid]?.totalHours || 0;
      const hoursB = employeeStats[b.uid]?.totalHours || 0;
      return sortBy === 'hours_desc' ? hoursB - hoursA : hoursA - hoursB;
    });
  }, [employees, workerNames, timesheets, searchTerm, sortBy, employeeStats, isSuperAdmin]);

  const historyRecords = useMemo(() => {
    if (!viewingHistory) return [];
    return timesheets
      .filter(ts => ts.user_id === viewingHistory.uid || ts.full_name === viewingHistory.full_name)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [viewingHistory, timesheets]);

  return (
    <div className="space-y-6 lg:space-y-10 font-sans max-w-[1600px] mx-auto p-4 md:p-8 pt-4">
      {viewingHistory ? (
        <div className="space-y-6 lg:space-y-10 animate-in fade-in slide-in-from-left-4 duration-300">
          <div className="flex items-center justify-between bg-white p-6 lg:p-10 rounded-[32px] lg:rounded-[48px] border border-slate-100 shadow-sm">
            <div className="flex items-center gap-4 lg:gap-8">
              <button 
                onClick={() => setViewingHistory(null)}
                className="w-10 h-10 lg:w-14 lg:h-14 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-all border border-slate-100"
              >
                <X size={24} />
              </button>
              <div className="flex items-center gap-4 lg:gap-6">
                <div className="w-12 h-12 lg:w-20 lg:h-20 rounded-2xl lg:rounded-[32px] bg-blue-600 text-white flex items-center justify-center font-black text-xl lg:text-3xl shadow-lg transform rotate-2 uppercase">
                  {viewingHistory.full_name?.[0].toUpperCase()}
                </div>
                <div className="text-left">
                  <h3 className="font-black text-slate-900 leading-none mb-1 text-lg lg:text-3xl uppercase italic">{viewingHistory.full_name}</h3>
                  <p className="text-[10px] lg:text-sm text-slate-400 font-bold uppercase tracking-widest">
                     @{viewingHistory.username} • {t('timesheet_history')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
             <div className="bg-white border border-slate-200 p-6 lg:p-10 rounded-[32px] lg:rounded-[48px] shadow-sm text-left">
                <p className="text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 italic flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />
                  {t('hours_this_month')}
                </p>
                <p className="text-3xl lg:text-7xl font-black text-slate-900">{employeeMonthlyHours.toFixed(1)}h</p>
             </div>
             <div className="bg-white border border-slate-200 p-6 lg:p-10 rounded-[32px] lg:rounded-[48px] shadow-sm text-left">
                <p className="text-[10px] lg:text-sm font-black text-slate-400 uppercase tracking-widest mb-2 italic flex items-center gap-2">
                  <TrendingUp size={14} className="text-emerald-500" />
                  {t('current_project')}
                </p>
                <p className="text-lg lg:text-2xl font-black text-slate-900 truncate uppercase italic">{employeeStats[viewingHistory.uid]?.currentProject || ''}</p>
             </div>
             <div className="bg-white border border-slate-200 p-6 lg:p-10 rounded-[32px] lg:rounded-[48px] shadow-sm text-left flex flex-col justify-between sm:col-span-1 lg:col-span-1">
                <p className="text-[10px] lg:text-sm font-black text-slate-400 uppercase tracking-widest mb-2 italic">{t('account_status')}</p>
                <span className={cn(
                  "text-[10px] lg:text-sm font-black uppercase px-4 py-1.5 lg:px-10 lg:py-4 rounded-xl lg:rounded-[32px] w-fit",
                  viewingHistory.is_active !== false ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-red-500 text-white shadow-lg shadow-red-100"
                )}>
                  {viewingHistory.is_active !== false ? t('active') : t('completed')}
                </span>
             </div>
          </div>

          {/* Project & Task Contribution Summary */}
          {employeeProjectStats.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm overflow-hidden p-6 text-left">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic mb-6">{t('project_contributions')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {employeeProjectStats.map(stat => (
                  <div key={stat.id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <h5 className="font-black text-slate-900 uppercase italic text-sm">{stat.name}</h5>
                      <span className="text-sm font-black text-blue-600 bg-white px-3 py-1 rounded-lg border border-blue-100 shadow-sm">{stat.total.toFixed(1)}h</span>
                    </div>
                    <div className="space-y-2">
                       {Object.entries(stat.tasks).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([task, sum]) => (
                         <div key={task} className="flex justify-between items-center">
                           <span className="text-[10px] font-bold text-slate-500 italic">{task}</span>
                           <span className="text-[10px] font-black text-slate-700">{(sum as number).toFixed(1)}h</span>
                         </div>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-[32px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/30">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">{t('work_history_log')}</h4>
            </div>
            <div className="divide-y divide-slate-100">
              {historyRecords.map(ts => (
                <div key={ts.id} className="p-6 hover:bg-slate-50/50 transition-all group text-left">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{ts.date}</span>
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded border tracking-widest uppercase",
                          ts.status === 'APPROVED' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          ts.status === 'REJECTED' ? "bg-red-50 text-red-600 border-red-100" : "bg-slate-50 text-slate-500 border-slate-100"
                        )}>
                          {t(ts.status.toLowerCase())}
                        </span>
                      </div>
                      <h4 className="font-black text-slate-900 uppercase italic text-sm">{projects[ts.project_id] || t('unknown_project')}</h4>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2 p-3 bg-slate-50 rounded-xl italic border border-slate-100 group-hover:bg-white transition-colors">
                        {ts.work_content}
                      </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <div className="bg-slate-900 px-5 py-3 rounded-2xl text-right shadow-lg group-hover:bg-blue-600 transition-colors">
                        <p className="text-xl font-black text-white italic leading-none">
                          {ts.status === 'APPROVED' 
                            ? ((ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0)).toFixed(1) 
                            : '0.0'}h
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 group-hover:text-blue-100 uppercase tracking-widest mt-1">{t('hours')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {historyRecords.length === 0 && (
                <div className="py-20 text-center text-slate-300 font-black italic uppercase text-xs">
                  {t('no_entries')}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header & Controls */}
      <div className="flex justify-end items-center">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t('filter_name') || ''}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="relative group">
            <select 
              className="appearance-none bg-white border border-slate-200 rounded-lg pl-4 pr-10 py-2 text-xs font-bold shadow-sm outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 min-w-[140px]"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
            >
              <option value="name">{t('sort_name')}</option>
              <option value="hours_desc">{t('sort_hours_desc')}</option>
              <option value="hours_asc">{t('sort_hours_asc')}</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl lg:rounded-[40px] overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 italic">
                <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">{t('full_name')}</th>
                <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest text-center">{t('view_details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processedEmployees.map((emp) => (
                <tr key={emp.uid} className={cn(
                  "hover:bg-slate-50/50 transition-colors group",
                  !emp.is_active && "opacity-60 bg-slate-50/30"
                )}>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex items-center gap-3 lg:gap-5">
                      <div className="relative">
                        <div className={cn(
                          "w-9 h-9 lg:w-12 lg:h-12 rounded-lg lg:rounded-2xl flex items-center justify-center font-black text-xs lg:text-sm shadow-inner uppercase",
                          emp.role === UserRole.SUPER_ADMIN ? "bg-purple-100 text-purple-600" :
                          emp.role === UserRole.ADMIN ? "bg-indigo-100 text-indigo-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                        </div>
                        <div className={cn(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 lg:w-4 lg:h-4 rounded-full border-2 border-white shadow-sm",
                          isOnline(emp) ? "bg-emerald-500" : "bg-slate-300"
                        )} />
                      </div>
                      <div className="flex flex-col text-left">
                        {editingFullname?.id === emp.uid ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus 
                              className="text-sm lg:text-base font-black border-b border-blue-500 outline-none w-32" 
                              value={editingFullname.value} 
                              onChange={(e) => setEditingFullname({ ...editingFullname, value: e.target.value })}
                            />
                            <button onClick={() => handleUpdateEmployeeName(emp)} className="text-emerald-500"><Check size={14} /></button>
                            <button onClick={() => setEditingFullname(null)} className="text-red-500"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group/name">
                            <span className="font-black text-slate-800 text-sm lg:text-base leading-none">{emp.full_name}</span>
                            {isAdmin && (
                              <div className="flex items-center gap-1 opacity-0 group-hover/name:opacity-100 transition-opacity">
                                <button onClick={() => setEditingFullname({ id: emp.uid, value: emp.full_name || '' })} className="p-1 text-slate-400 hover:text-blue-500 transition-colors">
                                  <Edit3 size={14} />
                                </button>
                                <button onClick={() => handleDeleteEmployee(emp)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-4">
                      <button 
                        onClick={() => setViewingHistory(emp)}
                        className="px-6 py-2.5 rounded-xl lg:rounded-2xl bg-blue-600 text-white text-[10px] lg:text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2"
                      >
                        <History size={14} />
                        {t('view_details')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {processedEmployees.length === 0 && (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <User size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">{t('no_employee')}</p>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-white/20">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                  <Key size={20} />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-slate-900 leading-none mb-1 uppercase tracking-tight">{t('reset_password')}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">@{resettingPassword.username}</p>
                </div>
              </div>
              <button 
                onClick={() => setResettingPassword(null)}
                className="text-slate-400 hover:text-red-500 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('new_password')}</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <button 
                onClick={handleResetPassword}
                disabled={!newPassword.trim() || !!updatingUser}
                className="w-full bg-indigo-600 shadow-lg shadow-indigo-100 text-white font-black uppercase tracking-widest text-xs py-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {t('save_changes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-white/20 transform animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight mb-2 uppercase italic">{t('delete_employee')}?</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed italic">
                  {t('confirm_delete')}<br/>
                  <span className="text-red-500 font-bold block mt-1 uppercase">@{deletingUser.username}</span>
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button 
                  onClick={() => setDeletingUser(null)}
                  className="px-4 py-3 rounded-xl border border-slate-200 text-xs font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                >
                  {t('cancel')}
                </button>
                <button 
                  onClick={handleDeleteUser}
                  disabled={!!updatingUser}
                  className="px-4 py-3 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {t('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
    )}
  </div>
);
}
