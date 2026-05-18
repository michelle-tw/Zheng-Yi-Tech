import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  BarChart3, 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Users,
  Settings,
  Check,
  X as CloseIcon
} from 'lucide-react';
import { collection, query, onSnapshot, where, orderBy, updateDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Project, ProjectStatus, UserRole } from '../types';
import { formatDateByLocale, formatTimeAgo, handleFirestoreError, OperationType } from '../lib/utils';
import { format } from 'date-fns';

export default function Dashboard({ onTabChange }: { onTabChange?: (tab: string, projectId?: string) => void }) {
  const { t, i18n } = useTranslation();
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalEmployees: 0,
    hoursThisMonth: 0,
    myProjectsCount: 0
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [userTimesheets, setUserTimesheets] = useState<any[]>([]);
  const [allTimesheets, setAllTimesheets] = useState<any[]>([]);

  const [projectProgressHours, setProjectProgressHours] = useState<Record<string, number>>({});
  const [projectsMap, setProjectsMap] = useState<Record<string, string>>({});
  const [usersInfo, setUsersInfo] = useState<Record<string, any>>({});
  
  const [showStatCustomizer, setShowStatCustomizer] = useState(false);
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<string | null>(null);
  const [selectedStats, setSelectedStats] = useState<string[]>(() => {
    const saved = localStorage.getItem('dashboard_stats');
    return saved ? JSON.parse(saved) : ['hours_this_month', 'my_projects', 'total_projects', 'total_employees'];
  });

  const availableStats = [
    { id: 'hours_this_month', label: t('stat_hours_this_month'), icon: <Clock size={16} />, color: 'blue' },
    { id: 'my_projects', label: t('stat_my_projects'), icon: <Briefcase size={16} />, color: 'emerald' },
    { id: 'total_projects', label: t('stat_total_projects'), icon: <TrendingUp size={16} />, color: 'purple' },
    { id: 'total_employees', label: t('stat_total_employees'), icon: <Users size={16} />, color: 'blue' },
    { id: 'active_projects', label: t('stat_active_projects'), icon: <TrendingUp size={16} />, color: 'emerald' },
    { id: 'completed_projects', label: t('stat_completed_projects'), icon: <CheckCircle2 size={16} />, color: 'blue' },
  ];

  const handleStatToggle = (id: string) => {
    setSelectedStats(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  useEffect(() => {
    localStorage.setItem('dashboard_stats', JSON.stringify(selectedStats));
  }, [selectedStats]);

  useEffect(() => {
    if (!db || !user) return;

    // Stats for projects - Public to all signed in users
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      const pMap: Record<string, string> = {};
      all.forEach(p => pMap[p.id] = p.name);
      setProjectsMap(pMap);

      setStats(prev => ({
        ...prev,
        totalProjects: all.length,
        activeProjects: all.filter(p => p.status === ProjectStatus.RUNNING).length,
        completedProjects: all.filter(p => p.status === ProjectStatus.FINISHED).length,
      }));
      setRecentProjects(all.slice(0, 5));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    // One-time cleanup: Delete ALL timesheets to reset everything to 0h
    const cleanupOldData = async () => {
      const hasReset = localStorage.getItem('data_reset_v2');
      if (hasReset) return;

      try {
        const { getDocs, collection, deleteDoc, doc } = await import('firebase/firestore');
        
        const snapshot = await getDocs(collection(db, 'timesheets'));
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, 'timesheets', d.id));
        }
        localStorage.setItem('data_reset_v2', 'true');
        console.log('All timesheets cleared');
      } catch (err) {
        console.error('Cleanup failed', err);
      }
    };
    cleanupOldData();

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const map: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        map[doc.id] = doc.data();
      });
      setUsersInfo(map);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubAllTimesheets = onSnapshot(collection(db, 'timesheets'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setAllTimesheets(list);
      const hoursMap: Record<string, number> = {};
      list.forEach(data => {
        const total = (data.normal_h || 0) + (data.ot_134_h || 0) + (data.ot_167_h || 0);
        hoursMap[data.project_id] = (hoursMap[data.project_id] || 0) + total;
      });
      setProjectProgressHours(hoursMap);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets');
    });

    const unsubWorkerNames = onSnapshot(collection(db, 'worker_names'), (snapshot) => {
      const names = snapshot.docs.map(doc => doc.data().name as string).filter(n => n !== '施杰倫');
      const initialNames = ['羅善文', '黃銘宗', '李柏翰', '張育祥', '謝鴻宇', '魏士鈞', '施杰綸', '梁寶銘'];
      const combined = Array.from(new Set([...initialNames, ...names]));
      setWorkerNames(combined);
    });

    // For everyone, calculate personal stats if needed (but primarily for employees)
    const q = query(
      collection(db, 'timesheets'),
      where('user_id', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubTimesheets = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setUserTimesheets(list.slice(0, 5));

      // Calculate monthly hours (include PENDING for immediate feedback)
      const now = new Date();
      const monthPrefix = format(now, 'yyyy-MM');
      const monthHours = list
        .filter(t => t.date.startsWith(monthPrefix))
        .reduce((acc, t) => acc + (t.normal_h || 0) + (t.ot_134_h || 0) + (t.ot_167_h || 0), 0);
      
      // Count unique projects
      const projectsSet = new Set(list.map(t => t.project_id));

      setStats(prev => ({
        ...prev,
        hoursThisMonth: parseFloat(monthHours.toFixed(1)),
        myProjectsCount: projectsSet.size
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets');
    });

    return () => {
      unsubProjects?.();
      unsubTimesheets?.();
      unsubUsers?.();
      unsubAllTimesheets?.();
      unsubWorkerNames?.();
    };
  }, [isAdmin, user]);

  // Combined stats calculation
  useEffect(() => {
    // Collect users that aren't super admins or default admin accounts
    const validUsers = Object.values(usersInfo).filter((u: any) => {
      if (
        u.role === 'SUPER_ADMIN' || 
        u.uid === 'public-admin' || 
        u.username === 'admin' || 
        u.username === 'zhengyitech' || 
        u.full_name?.toLowerCase().includes('public administrator')
      ) return false;
      return true;
    });

    const userNames = validUsers.map((u: any) => u.full_name).filter(Boolean);
    const timesheetNames = allTimesheets.map(ts => ts.full_name).filter(Boolean);
    const combined = Array.from(new Set([...workerNames, ...userNames, ...timesheetNames]));
    
    // Also filter combined names from generic admin name
    const finalNames = combined.filter(name => !name.toLowerCase().includes('public administrator'));

    setStats(prev => ({ 
      ...prev, 
      totalEmployees: finalNames.length 
    }));
  }, [workerNames, usersInfo, allTimesheets]);

  const getStatData = (id: string) => {
    switch (id) {
      case 'hours_this_month': return { icon: <Clock className="text-blue-500" size={20} />, label: t('hours_this_month'), value: `${stats.hoursThisMonth}h`, trend: format(new Date(), 'MMMM'), color: 'blue' };
      case 'my_projects': return { icon: <Briefcase className="text-emerald-500" size={20} />, label: t('my_projects'), value: stats.myProjectsCount, trend: t('active_status'), color: 'emerald' };
      case 'total_projects': return { icon: <TrendingUp className="text-purple-500" size={20} />, label: t('total_projects'), value: stats.totalProjects, trend: t('org_wide'), color: 'purple' };
      case 'total_employees': return { icon: <Users className="text-blue-500" size={20} />, label: t('total_employees'), value: stats.totalEmployees, trend: t('staff_count_desc'), color: 'blue' };
      case 'maintenance': return { icon: <Settings className="text-red-500" size={20} />, label: t('maintenance'), value: 'RESET', trend: 'Admin Only', color: 'red' };
      default: return null;
    }
  };

  const getLogDescription = (log: any) => {
    const actionKey = `log_${log.action.toLowerCase()}`;
    const localizedAction = t(actionKey);
    
    // Fallback if translation missing
    if (localizedAction === actionKey) return log.action;

    // PROJECT actions
    if (log.action === 'CREATE_PROJECT' || log.action === 'UPDATE_PROJECT' || log.action === 'DELETE_PROJECT') {
      return localizedAction;
    }

    // USER updates
    if (log.action === 'REGISTER' || log.action === 'UPDATE_USER_INFO' || log.action === 'DELETE_USER' || log.action === 'RESET_PASSWORD') {
      return localizedAction;
    }

    // ROLE updates
    if (log.action === 'UPDATE_ROLE' && log.new_value) {
      return `${localizedAction}: ${log.new_value.from || '?'} → ${log.new_value.to || '?'}`;
    }

    return localizedAction;
  };

  return (
    <div className="p-4 md:p-8 font-sans h-full">
      <div className="max-w-[1600px] mx-auto w-full space-y-6 md:space-y-8 lg:space-y-12">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 pt-4">
        <StatCard 
          icon={<Briefcase className="text-blue-500" size={20} />} 
          label={t('total_projects')} 
          value={stats.totalProjects} 
          trend="+0"
          color="blue"
          onClick={() => onTabChange?.('projects')}
        />
        <StatCard 
          icon={<TrendingUp className="text-emerald-500" size={20} />} 
          label={t('active_projects')} 
          value={stats.activeProjects} 
          trend="0%"
          color="emerald"
        />
        <StatCard 
          icon={<CheckCircle2 className="text-purple-500" size={20} />} 
          label={t('completed_projects')} 
          value={stats.completedProjects} 
          trend="0%"
          color="purple"
        />
        <StatCard 
          icon={<Users className="text-blue-500" size={20} />} 
          label={t('total_employees')} 
          value={stats.totalEmployees} 
          trend={t('staff_count_desc')}
          color="blue"
          onClick={() => onTabChange?.('employees')}
        />
      </div>

      {/* Project Status Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 pb-12">
        <div className="lg:col-span-2 space-y-6">


          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-[10px] md:text-sm lg:text-base font-black uppercase tracking-widest italic text-slate-700 flex items-center gap-2">
                <BarChart3 size={18} className="text-blue-600" />
                {t('project_progress')}
              </h2>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl lg:rounded-[40px] overflow-hidden shadow-sm">
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left min-w-[500px] md:min-w-0">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">{t('project_name')}</th>
                      <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">{t('manager')}</th>
                      <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest">{t('progress')}</th>
                      <th className="px-6 py-5 text-[10px] lg:text-xs font-black text-slate-400 uppercase tracking-widest text-right">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentProjects.map((project) => {
                      const actualHours = projectProgressHours[project.id] || 0;
                      const expectHours = project.expect_h || 1;
                      const progress = Math.min(Math.round((actualHours / expectHours) * 100), 100);

                      return (
                        <tr key={project.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-5">
                            <p className="text-sm lg:text-base font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase whitespace-nowrap">{project.name}</p>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 flex-wrap max-w-[200px] lg:max-w-[300px]">
                              {project.responsible_person && (
                                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl border border-blue-100 shadow-sm transition-transform hover:scale-105">
                                  <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-blue-600 flex items-center justify-center text-[10px] lg:text-sm font-black text-white uppercase transform rotate-3">
                                    {project.responsible_person.slice(0, 1).toUpperCase()}
                                  </div>
                                  <span className="text-[10px] lg:text-sm xl:text-base font-black text-blue-800 whitespace-nowrap italic">{project.responsible_person}</span>
                                </div>
                              )}
                              {!project.responsible_person && (
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">
                                    {project.manager_id?.slice(0, 2).toUpperCase() || 'AD'}
                                  </div>
                                  <span className="text-xs lg:text-sm font-bold text-slate-600 whitespace-nowrap">{project.manager_id || t('admin')}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-2 w-full min-w-[120px] max-w-[250px] px-2">
                              <div className="flex justify-between items-center w-full px-1">
                                <span className="text-[9px] lg:text-xs font-black text-slate-400 min-w-max">{actualHours}h / {expectHours}h</span>
                                <span className="text-[9px] lg:text-xs font-black text-blue-600 bg-blue-50 px-1.5 rounded-md border border-blue-100">{progress}%</span>
                              </div>
                              <div className="w-full h-2 lg:h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
                                <div 
                                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-700 ease-out shadow-lg" 
                                  style={{ width: `${progress}%` }} 
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => onTabChange?.('progress', project.id)}
                                className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-[10px] font-black uppercase tracking-tighter border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                              >
                                {t('details')}
                              </button>
                              <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-md border ${
                                project.status === ProjectStatus.RUNNING ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                project.status === ProjectStatus.FINISHED ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                'bg-slate-50 text-slate-600 border-slate-100'
                              }`}>
                                {t(project.status.toLowerCase())}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {recentProjects.length === 0 && (
                <div className="px-6 py-10 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.2em]">
                  {t('no_project_yet')}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-[10px] md:text-sm lg:text-base font-black uppercase tracking-widest italic text-slate-700 flex items-center gap-2 px-2">
            <Users size={18} className="text-blue-500" />
            {t('employees')}
          </h2>
          <div className="space-y-3 lg:space-y-4">
            {(() => {
              const workerHours: Record<string, number> = {};
              const workerLastUpdate: Record<string, any> = {};
              
              allTimesheets.forEach(ts => {
                if (ts.full_name) {
                  const total = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
                  workerHours[ts.full_name] = (workerHours[ts.full_name] || 0) + total;
                  
                  const tsTime = ts.created_at 
                    ? (ts.created_at.toMillis ? ts.created_at.toMillis() : new Date(ts.created_at).getTime()) 
                    : Date.now(); // Fallback for local pending writes
                    
                  if (!workerLastUpdate[ts.full_name] || tsTime > workerLastUpdate[ts.full_name].time) {
                    workerLastUpdate[ts.full_name] = { time: tsTime };
                  }
                }
              });

              // Combine specified workerNames with any names from timesheets
              const dynamicNames = allTimesheets.map(ts => ts.full_name).filter(Boolean);
              const combinedNames = Array.from(new Set([...workerNames, ...dynamicNames]));
              
              // Sort by last update time
              const sortedNames = combinedNames.sort((a, b) => {
                const timeA = workerLastUpdate[a]?.time || 0;
                const timeB = workerLastUpdate[b]?.time || 0;
                return timeB - timeA;
              });

              // Limit to 5
              const top5 = sortedNames.slice(0, 5);

              return (
                <>
                  {top5.map(name => (
                    <div key={name} className="bg-white border border-slate-200 p-4 lg:p-6 rounded-2xl md:rounded-3xl lg:rounded-[32px] hover:border-blue-300 transition-all group shadow-sm flex items-center justify-between">
                      <div className="flex items-center gap-3 lg:gap-4">
                        <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-2xl lg:rounded-3xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors shrink-0 font-black text-[10px] lg:text-xs text-slate-400 group-hover:text-blue-500 uppercase">
                          {name.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm lg:text-base font-black text-slate-800 leading-tight uppercase italic">{name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] lg:text-xs font-black text-slate-500 uppercase tracking-widest">{workerHours[name]?.toFixed(1) || '0.0'} H</span>
                            {workerLastUpdate[name]?.time > 0 && (
                              <span className="text-[10px] lg:text-xs font-bold text-blue-500 italic lowercase tracking-tight">
                                {t('updated_ago', { time: formatTimeAgo(workerLastUpdate[name].time, i18n.language) })}
                                </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => onTabChange?.('employees', name)}
                        className="px-3 py-2 lg:px-4 lg:py-3 text-[10px] lg:text-xs font-black uppercase text-blue-600 bg-blue-50 rounded-xl lg:rounded-2xl border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                      >
                        {t('view_details')}
                      </button>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => onTabChange?.('employees')}
                    className="w-full py-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white hover:border-blue-300 hover:text-blue-500 transition-all"
                  >
                    {t('view_all_employees')}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Project Detail Modal */}
      {selectedProjectForDetail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedProjectForDetail(null)} />
          <div className="relative bg-white w-full max-w-lg rounded-[32px] p-8 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter italic text-slate-900">
                  {projectsMap[selectedProjectForDetail] || t('details')}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {t('project_progress')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedProjectForDetail(null)}
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {(() => {
                const contributions: Record<string, number> = {};
                allTimesheets
                  .filter(ts => ts.project_id === selectedProjectForDetail && ts.status === 'APPROVED')
                  .forEach(ts => {
                    const total = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
                    contributions[ts.user_id] = (contributions[ts.user_id] || 0) + total;
                  });
                
                const sortedUsers = Object.entries(contributions).sort((a, b) => b[1] - a[1]);

                if (sortedUsers.length === 0) {
                  return (
                    <div className="py-12 text-center bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">{t('no_entries')}</p>
                    </div>
                  );
                }

                return sortedUsers.map(([userId, total]) => (
                  <div key={userId} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200 shadow-sm uppercase">
                        {usersInfo[userId]?.full_name?.slice(0, 2) || 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 uppercase italic leading-none">{usersInfo[userId]?.full_name || '...'}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1 italic">@{usersInfo[userId]?.username || '...'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-blue-600 leading-none">{total.toFixed(1)}h</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{t('total_hours')}</p>
                    </div>
                  </div>
                ));
              })()}
            </div>

            <button 
              onClick={() => setSelectedProjectForDetail(null)}
              className="w-full mt-6 bg-slate-900 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend, color, onClick }: any) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-4 md:p-6 lg:p-8 rounded-2xl md:rounded-3xl lg:rounded-[48px] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group overflow-hidden relative ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`absolute top-0 right-0 w-20 md:w-24 lg:w-32 h-20 md:h-24 lg:h-32 -mr-6 md:-mr-8 lg:-mr-10 -mt-6 md:-mt-8 lg:-mt-10 bg-${color}-50 rounded-full group-hover:scale-110 transition-transform opacity-30`} />
      <div className="relative">
        <div className="w-8 md:w-10 lg:w-14 h-8 md:h-10 lg:h-14 rounded-lg md:rounded-xl lg:rounded-2xl bg-slate-50 flex items-center justify-center mb-3 md:mb-4 lg:mb-6 border border-slate-100 shadow-inner group-hover:bg-white group-hover:scale-110 transition-all">
          {icon}
        </div>
                <div className="flex justify-between items-end gap-1">
          <div>
            <p className="text-[8px] md:text-[10px] lg:text-xs xl:text-sm font-black text-slate-400 uppercase tracking-widest mb-1 italic line-clamp-1">{label}</p>
            <h3 className="text-xl md:text-3xl lg:text-5xl xl:text-7xl font-black text-slate-900 tracking-tighter italic">{value}</h3>
          </div>
          <div className={`text-[8px] lg:text-[10px] xl:text-xs font-black px-1.5 py-0.5 lg:px-2.5 lg:py-1 rounded-md ${
            color === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-100' :
            color === 'emerald' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-100' :
            'bg-slate-50 text-slate-600 border-slate-100'
          } border uppercase tracking-tighter`}>
            {trend}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ user, action, target, time }: any) {
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-2xl md:rounded-3xl hover:border-blue-300 transition-all group shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors shrink-0">
          <Clock size={16} className="text-slate-400 group-hover:text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 leading-relaxed font-bold truncate mb-0.5">
                <span className="text-slate-900 uppercase italic mr-1">{user}</span>
              </p>
              <p className="text-sm font-black text-slate-800 leading-tight">
                {action}
              </p>
              {target && (
                <p className="text-[10px] text-red-500 font-bold italic mt-0.5">
                  {target}
                </p>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider whitespace-nowrap bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
              {time}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
