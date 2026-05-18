import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, FileText, Send, X, AlertCircle, Users, CheckCircle2 } from 'lucide-react';
import { calculateOT, cn, formatDateByLocale, handleFirestoreError, OperationType } from '../lib/utils';
import { format } from 'date-fns';
import { collection, addDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { TimesheetStatus, Project, UserProfile, UserRole } from '../types';

export default function TimesheetEntry({ onCancel, onSubmit, editEntry }: { onCancel: () => void, onSubmit?: (data: any) => void, editEntry?: any }) {
  const { t, i18n } = useTranslation();
  const { user, isAdmin, profile: currentProfile } = useAuth();
  const [date, setDate] = useState(editEntry?.date || format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(editEntry?.start_time || '08:00');
  const [endTime, setEndTime] = useState(editEntry?.end_time || '17:00');
  const [projectId, setProjectId] = useState(editEntry?.project_id || '');
  const [selectedUserName, setSelectedUserName] = useState(editEntry?.full_name || '');
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [allWorkerNames, setAllWorkerNames] = useState<string[]>([]);
  
  type Allocation = {
    id: number;
    projectId: string;
    hours: string;
    workOption: string;
    content: string;
  };

  const initialTotalHours = editEntry ? (editEntry.normal_h + editEntry.ot_134_h + editEntry.ot_167_h).toString() : '';

  const [allocations, setAllocations] = useState<Allocation[]>([
    { 
      id: Date.now(), 
      projectId: editEntry?.project_id || '', 
      hours: initialTotalHours, 
      workOption: editEntry?.work_content ? (['做線', '佈盤', '做機台', '點料'].includes(editEntry.work_content) ? editEntry.work_content : '其他') : '', 
      content: editEntry?.work_content && !['做線', '佈盤', '做機台', '點料'].includes(editEntry.work_content) ? editEntry.work_content : ''
    }
  ]);

  const [restTimeOption, setRestTimeOption] = useState('0'); // '0', '0.5', '1', '1.5', '2', 'custom'
  const [customRestTime, setCustomRestTime] = useState(''); // in hours as string
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const workOptions = [
    { value: '做線', label: '1.做線' },
    { value: '佈盤', label: '2.佈盤' },
    { value: '做機台', label: '3.做機台' },
    { value: '點料', label: '4.點料' },
    { value: '其他', label: '5.其他' },
  ];

  // Initial suggested names
  const initialNames = ['羅善文', '黃銘宗', '李柏翰', '張育祥', '謝鴻宇', '魏士鈞', '施杰綸', '梁寶銘'];

  useEffect(() => {
    if (!db) return;
    // Load worker names from a dedicated collection
    const unsubscribe = onSnapshot(collection(db, 'worker_names'), (snapshot) => {
      const names = snapshot.docs.map(doc => doc.data().name as string).filter(n => n !== '施杰倫');
      // Combine with initial names and remove duplicates
      const uniqueNames = Array.from(new Set([...initialNames, ...names]));
      setAllWorkerNames(uniqueNames);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db) return;
    // Load active projects
    const q = query(collection(db, 'projects'), where('status', '==', 'RUNNING'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });
    return () => unsubscribe?.();
  }, []);

  const filteredNames = allWorkerNames.filter(name => 
    name.toLowerCase().includes(selectedUserName.toLowerCase()) && 
    name !== selectedUserName
  );

  const getOT = () => {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    let diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    if (diff > 0) {
      let restHours = 0;
      if (restTimeOption === 'custom') {
        restHours = parseFloat(customRestTime) || 0;
      } else {
        restHours = parseFloat(restTimeOption) || 0;
      }
      
      diff -= restHours;
      if (diff < 0) diff = 0;

      const d = new Date(date);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      return calculateOT(diff, isWeekend);
    }
    return { normal: 0, ot134: 0, ot167: 0 };
  };

  const ot = getOT();

  const totalActualHours = ot.normal + ot.ot134 + ot.ot167;
  const totalAllocatedHours = allocations.reduce((sum, a) => sum + (parseFloat(a.hours) || 0), 0);
  const isMatch = !!editEntry || Math.abs(totalActualHours - totalAllocatedHours) < 0.01;
  const isValidAllocations = allocations.every(a => 
      a.projectId && 
      parseFloat(a.hours) > 0 && 
      a.workOption && 
      (a.workOption !== '其他' || a.content.trim())
  );
  // Also pass validation if editEntry
  const isSubmitDisabled = loading || !selectedUserName.trim() || !isMatch || !isValidAllocations || (!editEntry && totalActualHours === 0);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserName.trim()) {
      setError(t('enter_name'));
      return;
    }

    if ((!isMatch && !editEntry) || !isValidAllocations || (!editEntry && totalActualHours === 0)) {
      setError(t('hours_mismatch_error'));
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const { doc, collection, addDoc, serverTimestamp, writeBatch } = await import('firebase/firestore');
      
      if (!allWorkerNames.includes(selectedUserName.trim())) {
        await addDoc(collection(db!, 'worker_names'), {
          name: selectedUserName.trim(),
          created_at: serverTimestamp()
        });
      }

      if (!db) throw new Error("Database not initialized");

      const batch = writeBatch(db);

      if (editEntry) {
        // EDIT MODE: We only update the single document with its specific allocations.
        // We do not redistribute OT, we keep the original proportions unless hours drastically changed.
        const alloc = allocations[0];
        const oldH = editEntry.normal_h + editEntry.ot_134_h + editEntry.ot_167_h;
        let h = parseFloat(alloc.hours) || 0;
        
        let pNormal = editEntry.normal_h;
        let p134 = editEntry.ot_134_h;
        let p167 = editEntry.ot_167_h;

        if (Math.abs(h - oldH) > 0.01 && oldH > 0) {
          // If they tweaked the hours directly, scale proportionately
          pNormal = Number(((pNormal / oldH) * h).toFixed(2));
          p134 = Number(((p134 / oldH) * h).toFixed(2));
          p167 = Number(((p167 / oldH) * h).toFixed(2));
        }

        const finalContent = alloc.workOption === '其他' ? alloc.content : alloc.workOption;

        const entry = {
          user_id: editEntry.user_id,
          full_name: selectedUserName.trim(),
          project_id: alloc.projectId,
          date,
          start_time: startTime,
          end_time: endTime,
          normal_h: pNormal,
          ot_134_h: p134,
          ot_167_h: p167,
          work_content: finalContent,
          updated_at: serverTimestamp(),
          created_by_name: selectedUserName.trim()
        };

        batch.set(doc(db, 'timesheets', editEntry.id), entry, { merge: true });

      } else {
        // CREATE MODE: We distribute the global shift into the allocations
        let remainingNormal = ot.normal;
        let remaining134 = ot.ot134;
        let remaining167 = ot.ot167;

        for (let i = 0; i < allocations.length; i++) {
          const alloc = allocations[i];
          let h = parseFloat(alloc.hours) || 0;
          let pNormal = 0, p134 = 0, p167 = 0;

          if (h > 0 && remainingNormal > 0) {
            let take = Math.min(h, remainingNormal);
            pNormal = Number(take.toFixed(2));
            remainingNormal -= take;
            h -= take;
          }
          if (h > 0 && remaining134 > 0) {
            let take = Math.min(h, remaining134);
            p134 = Number(take.toFixed(2));
            remaining134 -= take;
            h -= take;
          }
          if (h > 0 && remaining167 > 0) {
            let take = Math.min(h, remaining167);
            p167 = Number(take.toFixed(2));
            remaining167 -= take;
            h -= take;
          }

          const finalContent = alloc.workOption === '其他' ? alloc.content : alloc.workOption;

          const entry = {
            user_id: 'public-' + selectedUserName.trim(),
            full_name: selectedUserName.trim(),
            project_id: alloc.projectId,
            date,
            start_time: startTime,
            end_time: endTime,
            normal_h: pNormal,
            ot_134_h: p134,
            ot_167_h: p167,
            work_content: finalContent,
            status: TimesheetStatus.APPROVED,
            locked: false,
            created_by: user?.uid || 'guest',
            created_by_name: selectedUserName.trim(),
            updated_at: serverTimestamp()
          };

          const newRef = doc(collection(db, 'timesheets'));
          batch.set(newRef, { ...entry, created_at: serverTimestamp() });
        }
      }

      await batch.commit();

      setShowSuccess(true);
    } catch (err: any) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'timesheets');
      } catch (fErr: any) {
        setError(fErr.message);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-lg mx-auto font-sans flex flex-col max-h-[90vh] sm:max-h-none">
      <div className="bg-slate-900 px-6 py-4 flex justify-between items-center text-white shrink-0">
        <h2 className="font-bold text-lg tracking-tight uppercase italic">{t('timesheet')}</h2>
        <button onClick={onCancel} className="p-1 hover:bg-slate-800 rounded-lg transition-colors">
          <X size={20} />
        </button>
      </div>

      {showSuccess ? (
        <div className="p-10 text-center space-y-6 flex flex-col items-center justify-center min-h-[300px] animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center shadow-inner border border-emerald-100">
            <CheckCircle2 size={40} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none">{editEntry ? t('update_success') : t('add_success')}</h3>
            <p className="text-sm text-slate-500 font-medium italic">{t('data_updated_immediately')}</p>
          </div>
          <button 
            onClick={() => {
              if (editEntry) {
                if (onSubmit) onSubmit({});
                onCancel();
              } else {
                setShowSuccess(false);
                setAllocations([{ id: Date.now(), projectId: '', hours: '', workOption: '', content: '' }]);
                setStartTime('08:00');
                setEndTime('17:00');
                setRestTimeOption('0');
                setCustomRestTime('');
                setDate(new Date().toISOString().split('T')[0]);
              }
            }}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
          >
            {t('confirm')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleFormSubmit} className="p-6 space-y-6 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="space-y-4">
            <div className="space-y-1.5 relative">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Users size={12} className="text-blue-500" /> {t('employee_name')}
              </label>
              <div className="relative">
                <input 
                  type="text"
                  value={selectedUserName}
                  required
                  autoComplete="off"
                  onChange={(e) => {
                    setSelectedUserName(e.target.value);
                    setShowNameSuggestions(true);
                  }}
                  onFocus={() => setShowNameSuggestions(true)}
                  placeholder={t('enter_name')}
                  className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-blue-900"
                />
                {showNameSuggestions && filteredNames.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    {filteredNames.map(name => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => {
                          setSelectedUserName(name);
                          setShowNameSuggestions(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {showNameSuggestions && (
                  <div className="fixed inset-0 z-40" onClick={() => setShowNameSuggestions(false)} />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Calendar size={12} /> {t('date').toUpperCase()}
                </label>
                <input 
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 lg:px-3 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 block"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Clock size={12} /> {t('date_time').toUpperCase()}
                </label>
                <div className="flex items-center gap-1 sm:gap-2">
                  <input 
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-1 sm:px-2 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 text-center"
                  />
                  <span className="text-slate-400 font-bold shrink-0">→</span>
                  <input 
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-1 sm:px-2 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700 text-center transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Clock size={12} className="text-orange-500" /> {t('rest_time')}
              </label>
              <select 
                value={restTimeOption}
                onChange={(e) => setRestTimeOption(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none"
              >
                <option value="0">{t('no_rest')}</option>
                <option value="0.5">{t('rest_30m')}</option>
                <option value="1">{t('rest_1h')}</option>
                <option value="1.5">{t('rest_1h30m')}</option>
                <option value="2">{t('rest_2h')}</option>
                <option value="custom">{t('rest_custom')}</option>
              </select>
              {restTimeOption === 'custom' && (
                  <input 
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={customRestTime}
                    onChange={(e) => setCustomRestTime(e.target.value)}
                    placeholder={t('rest_custom_placeholder')}
                    className="w-full mt-2 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
              )}
            </div>
            
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Clock size={12} className="text-emerald-500" /> {t('total_actual_hours')}
              </label>
              <div className="w-full bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm font-black text-emerald-700">
                {ot.normal + ot.ot134 + ot.ot167}h
              </div>
            </div>

            <div className="mt-4">
               <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-2">
                 <FileText size={12} className="text-purple-500" /> {t('payroll_preview')}
               </label>
               <div className="grid grid-cols-3 gap-2 py-2">
                  <div className="bg-slate-50 p-2 rounded-lg text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{t('normal')} 1.0</p>
                    <p className="text-sm font-black text-slate-900">{ot.normal}h</p>
                  </div>
                  <div className="bg-blue-50 p-2 rounded-lg text-center border border-blue-100">
                    <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">OT 1.34</p>
                    <p className="text-sm font-black text-blue-600">{ot.ot134}h</p>
                  </div>
                  <div className="bg-indigo-50 p-2 rounded-lg text-center border border-indigo-100">
                    <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter">OT 1.67</p>
                    <p className="text-sm font-black text-indigo-600">{ot.ot167}h</p>
                  </div>
               </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-200">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-4">
                <FileText size={12} className="text-blue-500" /> {t('project_and_task_allocation')}
              </label>
              
              <div className="space-y-4">
                {allocations.map((alloc, index) => (
                  <div key={alloc.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative">
                    {(!editEntry && allocations.length > 1) && (
                      <button type="button" onClick={() => setAllocations(allocations.filter(a => a.id !== alloc.id))} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 p-1 bg-white rounded-md border border-slate-200 shadow-sm z-10 transition-colors">
                        <X size={14} />
                      </button>
                    )}
                    
                    <div className="space-y-1.5 relative">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('project_name')}</label>
                      <select 
                        value={alloc.projectId}
                        required
                        onChange={(e) => {
                          const newAlloc = [...allocations];
                          newAlloc[index].projectId = e.target.value;
                          setAllocations(newAlloc);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold"
                      >
                        <option value="">{t('placeholder_project')}</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('actual_hours')}</label>
                        <input 
                          type="number"
                          step="0.1"
                          min="0.1"
                          required
                          value={alloc.hours}
                          onChange={(e) => {
                            const newAlloc = [...allocations];
                            newAlloc[index].hours = e.target.value;
                            setAllocations(newAlloc);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                        />
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('work_content')}</label>
                        <select 
                          value={alloc.workOption}
                          required
                          onChange={(e) => {
                            const newAlloc = [...allocations];
                            newAlloc[index].workOption = e.target.value;
                            setAllocations(newAlloc);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                        >
                          <option value="">{t('select_work_content')}</option>
                          {workOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {alloc.workOption === '其他' && (
                      <div className="space-y-1.5">
                        <textarea 
                          value={alloc.content}
                          required
                          onChange={(e) => {
                            const newAlloc = [...allocations];
                            newAlloc[index].content = e.target.value;
                            setAllocations(newAlloc);
                          }}
                          placeholder={t('placeholder_work_other') || '輸入其他工作內容...'}
                          rows={2}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none font-medium italic"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {!editEntry && (
                <button
                  type="button"
                  onClick={() => {
                    setAllocations([...allocations, { id: Date.now(), projectId: '', hours: '', workOption: '', content: '' }]);
                  }}
                  className="mt-3 w-full py-3 bg-blue-50 text-blue-600 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-100 transition-colors border border-blue-200 border-dashed flex items-center justify-center gap-2"
                >
                  {t('add_task')}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 font-bold bg-red-50 p-3 rounded-lg border border-red-100 italic">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          
          {(!isMatch && totalAllocatedHours > 0) && (
            <div className="flex items-center gap-2 text-xs text-red-500 font-bold bg-red-50 p-3 rounded-lg border border-red-100 italic mt-2">
              <AlertCircle size={14} /> {t('hours_mismatch_error')}
            </div>
          )}

          <div className="pt-2 sticky bottom-0 bg-white sm:relative sm:pt-0">
            <button 
              type="submit"
              disabled={isSubmitDisabled}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Send size={18} />
                  {t('submit')}
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

