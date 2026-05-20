import React, { useState, useEffect } from 'react';
import { calculateOT, handleFirestoreError, OperationType } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Check, AlertCircle, X, CheckSquare, Square, Edit3 } from 'lucide-react';

interface Allocation {
  id: number;
  projectId: string;
  hours: string;
  workOption: string;
  content: string;
}

interface BulkCloneFlowProps {
  userId: string;
  fullName: string;
  baseAllocations: Allocation[];
  baseStartTime: string;
  baseEndTime: string;
  baseRestTimeOption: string;
  baseCustomRestTime: string;
  projectsMap: Record<string, string>;
  onClose: () => void;
  uid: string; // The logged in user uid
}

interface DayState {
  date: string; // YYYY-MM-DD
  label: string;
  isWeekend: boolean;
  hasData: boolean;
  selected: boolean;
  allocations: Allocation[];
  startTime: string;
  endTime: string;
  restTimeOption: string;
  customRestTime: string;
  isEditing: boolean;
  error?: string;
}

export default function BulkCloneFlow({ 
  userId, 
  fullName, 
  baseAllocations, 
  baseStartTime, 
  baseEndTime, 
  baseRestTimeOption, 
  baseCustomRestTime,
  projectsMap,
  onClose,
  uid
}: BulkCloneFlowProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DayState[]>([]);
  const [error, setError] = useState('');

  const generateDays = async () => {
    if (!fromDate || !toDate) {
      setError(t('select_date_range'));
      return;
    }
    
    const start = new Date(fromDate);
    const end = new Date(toDate);
    
    if (start > end) {
      setError("Invalid date range");
      return;
    }
    
    // Time Fence (e.g., limit to max 31 days)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDaysDec = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDaysDec > 31) {
      setError("Max 31 days");
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Fetch existing timesheets for this user in the range
      const q = query(
        collection(db!, 'timesheets'),
        where('user_id', '==', userId),
        where('date', '>=', fromDate),
        where('date', '<=', toDate)
      );
      const snap = await getDocs(q);
      const existingDates = new Set(snap.docs.map(d => d.data().date));

      const newDays: DayState[] = [];
      let current = new Date(start);

      while (current <= end) {
        const dStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const hasData = existingDates.has(dStr);
        
        // Formatting Label
        const formatter = new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-TW' : 'vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
        const label = formatter.format(current);

        newDays.push({
          date: dStr,
          label,
          isWeekend,
          hasData,
          selected: !isWeekend && !hasData,
          // clone deeper to avoid reference issues
          allocations: baseAllocations.map(a => ({...a, id: Date.now() + Math.random()})),
          startTime: baseStartTime,
          endTime: baseEndTime,
          restTimeOption: baseRestTimeOption,
          customRestTime: baseCustomRestTime,
          isEditing: false
        });

        current.setDate(current.getDate() + 1);
      }

      setDays(newDays);
      setStep(3);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getOTForDay = (day: DayState) => {
    const startObj = new Date(`2000-01-01T${day.startTime}`);
    const endObj = new Date(`2000-01-01T${day.endTime}`);
    let diff = (endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60);
    
    if (diff > 0) {
      let restHours = 0;
      if (day.restTimeOption === 'custom') {
        restHours = parseFloat(day.customRestTime) || 0;
      } else {
        restHours = parseFloat(day.restTimeOption) || 0;
      }
      
      diff -= restHours;
      if (diff < 0) diff = 0;

      return calculateOT(diff, day.isWeekend);
    }
    return { normal: 0, ot134: 0, ot167: 0 };
  };

  const submitAll = async () => {
    const selectedDays = days.filter(d => d.selected && !d.hasData);
    if (selectedDays.length === 0) {
      onClose();
      return;
    }

    setLoading(true);
    
    // Validate
    for (const day of selectedDays) {
      const ot = getOTForDay(day);
      const totalActual = ot.normal + ot.ot134 + ot.ot167;
      const totalAllocated = day.allocations.reduce((sum, a) => sum + (parseFloat(a.hours) || 0), 0);
      
      if (Math.abs(totalActual - totalAllocated) > 0.01) {
        setDays(prev => prev.map(d => d.date === day.date ? { ...d, error: t('hours_mismatch_error') } : d));
        setLoading(false);
        return;
      }
      
      const isValid = day.allocations.every(a => 
        a.projectId && 
        parseFloat(a.hours) > 0 && 
        a.workOption && 
        (a.workOption !== '其他' || a.content.trim())
      );
      if (!isValid) {
        setDays(prev => prev.map(d => d.date === day.date ? { ...d, error: 'Invalid allocations' } : d));
        setLoading(false);
        return;
      }
      day.error = undefined; // clear error
    }

    try {
      const batch = writeBatch(db!);
      
      for (const day of selectedDays) {
        const ot = getOTForDay(day);
        let remainingNormal = ot.normal;
        let remaining134 = ot.ot134;
        let remaining167 = ot.ot167;

        for (let i = 0; i < day.allocations.length; i++) {
          const alloc = day.allocations[i];
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
            user_id: userId,
            full_name: fullName,
            project_id: alloc.projectId,
            date: day.date,
            start_time: day.startTime,
            end_time: day.endTime,
            normal_h: pNormal,
            ot_134_h: p134,
            ot_167_h: p167,
            work_content: finalContent,
            status: 'APPROVED',
            locked: false,
            created_by: uid,
            created_by_name: fullName,
            updated_at: serverTimestamp(),
            created_at: serverTimestamp()
          };

          const newRef = doc(collection(db!, 'timesheets'));
          batch.set(newRef, entry);
        }
      }

      await batch.commit();
      onClose();
      setTimeout(() => alert(t('update_success')), 100);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    const allSelected = days.filter(d => !d.hasData).every(d => d.selected);
    setDays(days.map(d => {
      if (d.hasData) return d;
      return { ...d, selected: !allSelected };
    }));
  };

  // UI Components
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col border border-white/20 transform animate-in fade-in zoom-in duration-200">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Check size={40} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 leading-tight mb-3 uppercase italic">
                {t('clone_success_title')}
              </h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed italic">
                {t('clone_success_desc')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-200 transition-colors">
                {t('skip')}
              </button>
              <button onClick={() => setStep(2)} className="px-4 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-700 transition-colors shadow-md shadow-blue-600/20">
                {t('clone_multiple')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-slate-900/40 backdrop-blur-sm text-slate-800">
        <div className="bg-white w-full h-full md:h-auto md:w-full md:max-w-md md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in duration-300">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0 bg-white">
            <h2 className="text-lg font-black uppercase italic tracking-tight">{t('select_date_range')}</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
             <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('from_date')}</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('to_date')}</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 font-bold" />
                </div>
             </div>
             {error && <div className="text-xs text-red-500 italic flex items-center gap-1 font-bold"><AlertCircle size={14}/> {error}</div>}
          </div>
          <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
             <button disabled={loading} onClick={generateDays} className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm tracking-widest shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center">
                {loading ? <span className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full"></span> : t('generate_days')}
             </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3
  const hasSelected = days.some(d => d.selected && !d.hasData);
  const isAllSelected = days.filter(d => !d.hasData).length > 0 && days.filter(d => !d.hasData).every(d => d.selected);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center bg-slate-900/40 backdrop-blur-sm text-slate-800">
      <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:w-full md:max-w-2xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in duration-300">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0 bg-white">
          <div className="flex items-center gap-3">
             <button onClick={() => setStep(2)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition-colors">
               <Calendar size={18} />
             </button>
             <h2 className="text-lg font-black uppercase italic tracking-tight">{t('clone_multiple')}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex items-center justify-between px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
           <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-bold text-blue-600 focus:outline-none">
              {isAllSelected ? <CheckSquare size={18} className="text-blue-600"/> : <Square size={18} className="text-slate-400"/>}
              <span className="uppercase tracking-widest text-[10px]">{isAllSelected ? t('unselect_all') : t('select_all')}</span>
           </button>
           <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200 shadow-sm">{days.filter(d => d.selected && !d.hasData).length} {t('records')}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {days.map((day, dIdx) => (
            <div key={day.date} className={`border rounded-2xl overflow-hidden transition-all ${day.hasData ? 'border-slate-200 bg-slate-50 opacity-60' : day.isWeekend ? 'border-amber-200 bg-amber-50/30' : day.selected ? 'border-blue-200 bg-blue-50/30 ring-1 ring-blue-100' : 'border-slate-200 bg-white'}`}>
               <div className="p-4 flex items-start gap-4">
                  <button 
                    disabled={day.hasData} 
                    onClick={() => {
                      const newDays = [...days];
                      newDays[dIdx].selected = !newDays[dIdx].selected;
                      setDays(newDays);
                    }}
                    className="mt-1 focus:outline-none disabled:opacity-50"
                  >
                    {day.selected ? (
                      <CheckSquare size={20} className="text-blue-600" />
                    ) : (
                      <Square size={20} className={day.hasData ? "text-slate-300" : "text-slate-400"} />
                    )}
                  </button>
                  <div className="flex-1 space-y-1">
                     <div className="flex items-center gap-2">
                       <h4 className={`font-black uppercase tracking-tight text-sm ${day.hasData ? 'text-slate-500' : 'text-slate-800'}`}>
                         {day.label}
                       </h4>
                       {day.hasData && <span className="text-[9px] font-bold uppercase tracking-widest bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-sm">{t('day_existing_data')}</span>}
                       {(!day.hasData && day.isWeekend) && <span className="text-[9px] font-bold uppercase tracking-widest bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-sm">{t('day_weekend_holiday')}</span>}
                     </div>
                     
                     <div className="text-xs font-medium text-slate-600">
                       <p><span className="font-bold text-slate-400">Time:</span> {day.startTime} - {day.endTime}</p>
                       <div className="mt-1.5 space-y-1">
                         {day.allocations.map(a => (
                           <div key={a.id} className="bg-slate-100/50 rounded-md p-1.5 flex items-center gap-1.5 border border-slate-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                              <span className="font-bold">{projectsMap[a.projectId] || 'Project'}</span>
                              <span className="text-slate-400">-</span>
                              <span className="font-black text-blue-600">{a.hours}h</span>
                              <span className="text-slate-400">-</span>
                              <span className="italic">{a.workOption === '其他' ? a.content : a.workOption}</span>
                           </div>
                         ))}
                       </div>
                     </div>
                     {day.error && <p className="text-xs text-red-500 font-bold italic pt-1">{day.error}</p>}
                  </div>
                  
                  {!day.hasData && (
                    <button 
                      onClick={() => {
                         const newDays = [...days];
                         newDays[dIdx].isEditing = !newDays[dIdx].isEditing;
                         setDays(newDays);
                      }}
                      className={`p-2 rounded-lg transition-colors ${day.isEditing ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-blue-600 hover:bg-slate-200'}`}
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
               </div>

               {/* Editor Section */}
               {day.isEditing && !day.hasData && (
                 <div className="border-t border-slate-200 bg-white p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Giờ vào</label>
                        <select value={day.startTime} onChange={(e) => {
                          const n = [...days]; n[dIdx].startTime = e.target.value; setDays(n);
                        }} className="w-full border border-slate-200 py-2 px-3 rounded-lg text-sm font-bold outline-none focus:border-blue-500 appearance-none bg-white">
                          {Array.from({ length: 48 }).map((_, i) => {
                            const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
                            return <option key={t} value={t}>{t}</option>;
                          })}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Giờ ra</label>
                        <select value={day.endTime} onChange={(e) => {
                          const n = [...days]; n[dIdx].endTime = e.target.value; setDays(n);
                        }} className="w-full border border-slate-200 py-2 px-3 rounded-lg text-sm font-bold outline-none focus:border-blue-500 appearance-none bg-white">
                          {Array.from({ length: 48 }).map((_, i) => {
                            const t = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`;
                            return <option key={t} value={t}>{t}</option>;
                          })}
                        </select>
                      </div>
                    </div>
                    {/* Add basic allocation editor here if needed, or keep it read-only for allocations and let them edit hours if simple. BUT requirement says edit hours or content. So we should show a mini allocation list. */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Phân bổ chi tiết</label>
                       {day.allocations.map((alloc, aIdx) => (
                         <div key={alloc.id} className="grid grid-cols-12 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 items-start relative">
                            {/* Simple inline edit */}
                            <div className="col-span-5 relative">
                               <select 
                                  value={alloc.projectId}
                                  onChange={e => { const n=[...days]; n[dIdx].allocations[aIdx].projectId = e.target.value; setDays(n); }}
                                  className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none font-bold"
                                >
                                  {Object.entries(projectsMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                               </select>
                            </div>
                            <div className="col-span-2">
                               <input type="number" step="0.1" value={alloc.hours} onChange={e => { const n=[...days]; n[dIdx].allocations[aIdx].hours = e.target.value; setDays(n); }} className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs font-bold text-center" />
                            </div>
                            <div className="col-span-4">
                               <select 
                                  value={alloc.workOption}
                                  onChange={e => { const n=[...days]; n[dIdx].allocations[aIdx].workOption = e.target.value; setDays(n); }}
                                  className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none font-bold"
                                >
                                  <option value="做線">1.做線</option>
                                  <option value="佈盤">2.佈盤</option>
                                  <option value="做機台">3.做機台</option>
                                  <option value="點料">4.點料</option>
                                  <option value="其他">5.其他</option>
                               </select>
                            </div>
                            <div className="col-span-1 flex items-center justify-center">
                              {day.allocations.length > 1 && (
                                <button onClick={() => { const n=[...days]; n[dIdx].allocations = n[dIdx].allocations.filter((_, i) => i !== aIdx); setDays(n); }} className="text-slate-400 hover:text-red-500 mt-1"><X size={14}/></button>
                              )}
                            </div>
                            {alloc.workOption === '其他' && (
                              <div className="col-span-12 mt-1">
                                <input type="text" value={alloc.content} onChange={e => { const n=[...days]; n[dIdx].allocations[aIdx].content = e.target.value; setDays(n); }} placeholder="Nội dung khác..." className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs font-medium italic" />
                              </div>
                            )}
                         </div>
                       ))}
                       <button onClick={() => { const n=[...days]; n[dIdx].allocations.push({id: Date.now(), projectId: '', hours: '', workOption: '做線', content: ''}); setDays(n); }} className="text-[10px] font-black uppercase text-blue-600 tracking-widest mt-2 hover:underline">+ {t('add_task') || 'Thêm'}</button>
                    </div>
                 </div>
               )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
           {error && <div className="text-xs text-red-500 italic pb-3 font-bold text-center">{error}</div>}
           <button 
             disabled={loading || !hasSelected} 
             onClick={submitAll} 
             className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 flex justify-center items-center gap-2 transition-all active:scale-[0.98]"
           >
             {loading && <span className="animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full"></span>}
             {t('clone_confirm_btn')}
           </button>
        </div>
      </div>
    </div>
  );
}
