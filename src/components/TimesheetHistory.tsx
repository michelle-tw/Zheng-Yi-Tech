import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { TimesheetEntry, TimesheetStatus, Project } from '../types';
import { Clock, CheckCircle2, XCircle, Filter, Calendar, Trash2, RotateCcw, User as UserIcon } from 'lucide-react';
import { cn, formatDateByLocale, handleFirestoreError, OperationType } from '../lib/utils';
import TimesheetEntryForm from './TimesheetEntry';
import { Edit2 } from 'lucide-react';

export default function TimesheetHistory() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  const [filterDate, setFilterDate] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    if (!db || !user) return;

    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const projMap: Record<string, string> = {};
      snapshot.docs.forEach(doc => {
        projMap[doc.id] = (doc.data() as Project).name;
      });
      setProjects(projMap);
    });

    const unsubWorkerNames = onSnapshot(collection(db, 'worker_names'), (snapshot) => {
      const names = snapshot.docs.map(doc => doc.data().name as string).filter(n => n !== '施杰倫');
      const initialNames = ['羅善文', '黃銘宗', '李柏翰', '張育祥', '謝鴻宇', '魏士鈞', '施杰綸', '梁寶銘'];
      setWorkerNames(Array.from(new Set([...initialNames, ...names])));
    });

    const q = query(
      collection(db, 'timesheets'),
      orderBy('date', 'desc'),
      orderBy('created_at', 'desc')
    );

    const unsubTimesheets = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimesheetEntry));
      setEntries(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets');
      setLoading(false);
    });

    return () => {
      unsubProjects();
      unsubWorkerNames();
      unsubTimesheets();
    };
  }, [user]);

  const handleDelete = async (entryId: string) => {
    try {
      await updateDoc(doc(db, 'timesheets', entryId), {
        deleted_at: serverTimestamp(),
        deleted_by: user?.uid
      });
      setFeedback({ type: 'success', message: t('delete_success') });
      setTimeout(() => setFeedback(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `timesheets/${entryId}`);
    }
  };

  const handleRestore = async (entryId: string) => {
    try {
      await updateDoc(doc(db, 'timesheets', entryId), {
        deleted_at: null,
        deleted_by: null
      });
      setFeedback({ type: 'success', message: t('restore_success') });
      setTimeout(() => setFeedback(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `timesheets/${entryId}`);
    }
  };

  const filteredEntries = entries.filter(entry => {
    if (showTrash) {
      if (!entry.deleted_at) return false;
      const dAt = entry.deleted_at?.toMillis ? entry.deleted_at.toMillis() : new Date(entry.deleted_at).getTime();
      if (Date.now() - dAt > 30 * 24 * 60 * 60 * 1000) return false;
    } else {
      if (entry.deleted_at) return false;
    }
    if (filterDate && entry.date !== filterDate) return false;
    if (filterName && (entry.full_name || '') !== filterName) return false;
    if (filterStatus !== 'ALL' && entry.status !== filterStatus) return false;
    return true;
  });

  const getStatusIcon = (s: TimesheetStatus) => {
    switch (s) {
      case TimesheetStatus.APPROVED: return <CheckCircle2 className="text-emerald-500" size={16} />;
      case TimesheetStatus.REJECTED: return <XCircle className="text-red-500" size={16} />;
      default: return <Clock className="text-amber-500" size={16} />;
    }
  };

  if (loading) return <div className="p-12 text-center animate-pulse tracking-widest uppercase font-black text-slate-300">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-white border p-6 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Filter size={18} className="text-blue-600" />
          <h3 className="text-xs font-black uppercase tracking-widest">{t('filter')}</h3>
          <button onClick={() => setShowTrash(!showTrash)} className={cn("ml-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all border", showTrash ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-500")}>
            {showTrash ? t('timesheet_history') : t('trash')}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl text-xs font-bold" />
          <select value={filterName} onChange={(e) => setFilterName(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl text-xs font-bold">
            <option value="">{t('all')} ({t('employee_name')})</option>
            {workerNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl text-xs font-bold">
            <option value="ALL">{t('all')} ({t('status')})</option>
            <option value={TimesheetStatus.PENDING}>{t('pending')}</option>
            <option value={TimesheetStatus.APPROVED}>{t('approved')}</option>
            <option value={TimesheetStatus.REJECTED}>{t('rejected')}</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredEntries.map(entry => (
          <div key={entry.id} className="bg-white border rounded-2xl p-5 shadow-sm relative group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-sm font-black uppercase italic">{projects[entry.project_id] || t('unknown_project')}</span>
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg uppercase">
                    <UserIcon size={12}/> {entry.full_name}
                  </div>
                  {getStatusIcon(entry.status)}
                </div>
                <div className="flex gap-4 text-[11px] font-bold text-slate-400">
                   <span className="flex items-center gap-1"><Calendar size={12}/>{formatDateByLocale(entry.date, i18n.language)}</span>
                   <span className="flex items-center gap-1"><Clock size={12}/>{entry.start_time}-{entry.end_time}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black italic">{(entry.normal_h + entry.ot_134_h + entry.ot_167_h).toFixed(1)}h</span>
              </div>
            </div>
            {entry.work_content && <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl italic mb-3">{entry.work_content}</p>}
            <div className="flex justify-end gap-2">
              {showTrash ? (
                <button onClick={() => handleRestore(entry.id)} className="p-2 text-[10px] font-bold uppercase text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><RotateCcw size={12}/></button>
              ) : (
                <>
                  <button onClick={() => setEditingEntry(entry)} className="p-2 text-[10px] font-bold uppercase text-blue-400 bg-slate-50 rounded-lg hover:bg-blue-500 hover:text-white transition-all"><Edit2 size={12}/></button>
                  <button onClick={() => setConfirmDeleteId(entry.id)} className="p-2 text-[10px] font-bold uppercase text-slate-400 bg-slate-50 rounded-lg hover:bg-red-500 hover:text-white transition-all"><Trash2 size={12}/></button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-8 rounded-3xl w-full max-w-sm border shadow-2xl">
            <h3 className="text-lg font-black text-center mb-6 uppercase italic">{t('confirm_delete')}?</h3>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setConfirmDeleteId(null)} className="py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs">{t('cancel')}</button>
              <button onClick={async () => { const id = confirmDeleteId; setConfirmDeleteId(null); if (id) await handleDelete(id); }} className="py-3 bg-red-500 text-white rounded-xl font-bold uppercase text-xs">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom z-[60]">
           <span className="text-[10px] font-black uppercase tracking-widest">{feedback.message}</span>
        </div>
      )}

      {editingEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg">
            <TimesheetEntryForm 
              onCancel={() => setEditingEntry(null)} 
              editEntry={editingEntry}
              onSubmit={() => setEditingEntry(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
