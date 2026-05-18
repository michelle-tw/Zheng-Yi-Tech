import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TimesheetEntry, Project, ProjectStatus } from '../types';
import { formatDateByLocale, handleFirestoreError, OperationType } from '../lib/utils';
import { Clock, Briefcase, Users, Calendar, Filter, Search, ArrowLeft } from 'lucide-react';
import TimesheetEntryComponent from './TimesheetEntry';

export default function ProgressTracking({ initialProjectId, onBack }: { initialProjectId?: string, onBack?: () => void }) {
  const { t, i18n } = useTranslation();
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || 'all');
  const [loading, setLoading] = useState(true);
  const [workerFilter, setWorkerFilter] = useState('');
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [deletingEntry, setDeletingEntry] = useState<any>(null);

  useEffect(() => {
    if (!db) return;

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(list);
    });

    const q = query(collection(db, 'timesheets'), orderBy('created_at', 'desc'));
    const unsubTimesheets = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setTimesheets(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets');
    });

    return () => {
      unsubProjects();
      unsubTimesheets();
    };
  }, []);

  const projectsMap = projects.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as Record<string, Project>);

  const filteredTimesheets = timesheets.filter(ts => {
    const matchesProject = selectedProjectId === 'all' || ts.project_id === selectedProjectId;
    const matchesWorker = !workerFilter || (ts as any).full_name?.toLowerCase().includes(workerFilter.toLowerCase());
    return matchesProject && matchesWorker && ts.status === 'APPROVED';
  });

  const projectStats = projects.map(p => {
    const pTimesheets = timesheets.filter(ts => ts.project_id === p.id && ts.status === 'APPROVED');
    const totalHours = pTimesheets.reduce((acc, ts) => acc + (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0), 0);
    const progress = p.expect_h ? (totalHours / p.expect_h) * 100 : 0;
    return { ...p, totalHours, progress };
  });

  return (
    <div className="p-4 md:p-8 space-y-6 font-sans">
      <div className="flex justify-start">
        {onBack && (
          <button 
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
          >
            <ArrowLeft size={16} />
            {t('back_to_projects')}
          </button>
        )}
      </div>
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
        <div className="w-full md:w-1/3 space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
            <Filter size={12} />
            {t('filter_by_project')}
          </label>
          <select 
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black uppercase tracking-tighter outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="all">{t('all_projects')}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="w-full md:w-1/3 space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-2">
            <Search size={12} />
            {t('search_worker')}
          </label>
          <input 
            type="text"
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            placeholder={t('worker_name_placeholder') || '...'}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-black uppercase tracking-tighter outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 italic">{t('project_summary')}</h2>
          <div className="space-y-3">
            {projectStats.filter(p => selectedProjectId === 'all' || p.id === selectedProjectId).map(p => (
              <div key={p.id} className="bg-white border border-slate-200 p-6 rounded-[32px] shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase italic">{p.name}</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {t('manager')}: {t('system')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-md border ${
                    p.status === ProjectStatus.RUNNING ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>
                    {t(p.status.toLowerCase())}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <span>{t('progress')}</span>
                    <span>{Number(p.progress.toFixed(1))}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${p.progress >= 100 ? 'bg-amber-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(p.progress, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter">
                    <span className="text-slate-900">{Number(p.totalHours.toFixed(1))}h</span>
                    <span className="text-slate-400">/ {p.expect_h}h</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">{t('task_breakdown')}</h4>
                  {(() => {
                    const taskMap: Record<string, number> = {};
                    const workerTaskMap: Record<string, Record<string, number>> = {};
                    
                    const pTimesheets = timesheets.filter(ts => ts.project_id === p.id && ts.status === 'APPROVED');
                    
                    pTimesheets.forEach(ts => {
                      const hours = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
                      
                      // Task Summary
                      const taskName = ts.work_content || t('other');
                      taskMap[taskName] = (taskMap[taskName] || 0) + hours;
                      
                      // Worker-Task Summary
        const worker = ts.full_name || '-';
        if (!workerTaskMap[worker]) workerTaskMap[worker] = {};
        workerTaskMap[worker][taskName] = (workerTaskMap[worker][taskName] || 0) + hours;
      });

      return (
        <div className="space-y-6">
          <div className="space-y-3">
            {Object.entries(taskMap).sort((a,b) => b[1]-a[1]).map(([task, sum]) => (
              <div key={task} className="flex justify-between items-center group">
                <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors">{task}</span>
                <span className="text-sm font-black text-slate-900 bg-slate-50 px-3 py-1 rounded-xl group-hover:bg-blue-50 transition-colors shadow-sm">{Number(sum.toFixed(1))}h</span>
              </div>
            ))}
          </div>
          
          {Object.keys(workerTaskMap).length > 0 && (
            <div className="pt-6 border-t border-dashed border-slate-200">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic mb-4">{t('worker_task_details')}</h5>
              <div className="space-y-4">
                {Object.entries(workerTaskMap).map(([worker, tasks]) => (
                  <div key={worker} className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-3 shadow-sm">
                    <div className="text-sm flex items-center gap-2 font-black text-slate-800 uppercase italic">
                      <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-600 flex justify-center items-center text-[10px] not-italic">{worker.slice(0, 2)}</div>
                      {worker}
                    </div>
                    <div className="space-y-3 pl-2">
                      {Object.entries(tasks).sort((a,b) => (b[1] as number)-(a[1] as number)).map(([task, hours]) => (
                        <div key={task} className="flex justify-between items-center group">
                          <span className="text-xs font-bold text-slate-600 group-hover:text-blue-600 transition-colors">{task}</span>
                          <span className="text-sm font-black text-slate-900 bg-white px-3 py-1 rounded-xl group-hover:bg-blue-50 transition-colors border border-slate-100 shadow-sm">{Number((hours as any).toFixed(1))}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    })()}
  </div>

                {p.expected_completion_date && (
                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Calendar size={14} />
                      <span className="text-[9px] font-bold uppercase tracking-widest">{t('due_date')}</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-700">{p.expected_completion_date}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 italic">{t('work_history_log')}</h2>
          <div className="space-y-3">
            {filteredTimesheets.map((ts: any) => (
              <div key={ts.id} className="bg-white border border-slate-200 p-5 rounded-3xl hover:border-blue-300 transition-all group shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 transition-colors shrink-0 font-black text-xs text-slate-400 group-hover:text-blue-500 uppercase italic">
                    {ts.full_name?.slice(0, 2) || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-800 leading-tight uppercase italic">{ts.full_name}</p>
                    </div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter mt-0.5">
                      {projectsMap[ts.project_id]?.name || t('unknown_project')}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed break-words line-clamp-2 md:max-w-md">{ts.work_content}</p>
                    {(ts.updated_at || ts.created_at) && (
                      <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                        {t('submitted_at')}: {new Date((ts.updated_at || ts.created_at).seconds ? (ts.updated_at || ts.created_at).seconds * 1000 : (ts.updated_at || ts.created_at)).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 w-full md:w-auto">
                  <div className="flex gap-2 mr-2">
                    <button 
                      onClick={() => setEditingEntry(ts)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-transparent hover:border-blue-100 shadow-sm"
                      title={t('edit')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button 
                      onClick={() => setDeletingEntry(ts)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100 shadow-sm"
                      title={t('delete')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                  </div>
                  <div className="text-left md:text-right shrink-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{formatDateByLocale(ts.date, i18n.language)}</p>
                    <p className="text-[10px] sm:text-xs font-bold text-slate-600 mt-0.5 uppercase tracking-tighter">{ts.start_time} - {ts.end_time}</p>
                  </div>
                  <div className="bg-slate-900 px-3 sm:px-4 py-2 rounded-2xl text-right shrink-0 flex items-center h-fit">
                    <p className="text-xs sm:text-sm font-black text-white leading-none">{Number((ts.normal_h + ts.ot_134_h + ts.ot_167_h).toFixed(1))}h</p>
                  </div>
                </div>
              </div>
            ))}
            {filteredTimesheets.length === 0 && !loading && (
              <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">{t('no_entries')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {editingEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingEntry(null)} />
          <div className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in duration-200">
            <TimesheetEntryComponent 
              editEntry={editingEntry}
              onCancel={() => setEditingEntry(null)}
              onSubmit={() => setEditingEntry(null)}
            />
          </div>
        </div>
      )}

      {deletingEntry && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeletingEntry(null)} />
          <div className="relative z-10 w-full max-w-md bg-white rounded-[32px] p-8 md:p-10 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-red-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none mb-8">
              {t('delete_confirm')}
            </h3>
            <div className="flex gap-4">
              <button 
                onClick={() => setDeletingEntry(null)}
                className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all active:scale-95"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={async () => {
                  setDeletingEntry(null);
                  try {
                    const { deleteDoc, doc } = await import('firebase/firestore');
                    await deleteDoc(doc(db!, 'timesheets', deletingEntry.id));
                  } catch (e) {
                    console.error("Failed to delete entry", e);
                  }
                }}
                className="flex-1 px-6 py-4 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-900/20"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
