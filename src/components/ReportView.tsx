import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { TimesheetEntry, Project, UserProfile, UserRole } from '../types';
import { exportTimesheetToExcel } from '../services/exportService';
import { FileDown, Filter, Calendar as CalendarIcon, Database } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export default function ReportView() {
  const { t, i18n } = useTranslation();
  const { isAdmin, profile, user } = useAuth();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db) return;
    // Load projects and users for data mapping
    const loadMetadata = async () => {
      try {
        const projSnap = await getDocs(collection(db, 'projects'));
        const projs = projSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setProjects(projs);
        
        const userSnap = await getDocs(collection(db, 'users'));
        setUsers(userSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      } catch (err) {
        console.error("Error loading metadata:", err);
      }
    };
    loadMetadata();
  }, [isAdmin, profile]);

  const handleExport = async () => {
    if (!user || !db || !selectedProjectId) return;
    setLoading(true);
    
    try {
      const constraints = [
        where('project_id', '==', selectedProjectId),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      ];

      const q = query(collection(db, 'timesheets'), ...constraints);
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as TimesheetEntry));
      
      const project = projects.find(p => p.id === selectedProjectId);
      const toMinguoFormat = (dateStr: string) => {
        const d = new Date(dateStr);
        const minguoYear = d.getFullYear() - 1911;
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${minguoYear}${month}${day}`;
      };
      
      const filename = `${project?.name || 'Project'}_Report_${toMinguoFormat(startDate)}_to_${toMinguoFormat(endDate)}.xlsx`;
      exportTimesheetToExcel(data, projects, users, t, i18n.language, filename, selectedProjectId);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pt-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6 md:p-8">
        <div className="bg-slate-50 p-4 md:p-6 rounded-2xl border border-slate-100 mb-8">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest leading-loose">
            {t('report_desc')}
          </p>
        </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <CalendarIcon size={12} className="text-blue-500" /> {t('from_date').toUpperCase()}
              </label>
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <CalendarIcon size={12} className="text-blue-500" /> {t('to_date').toUpperCase()}
              </label>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Filter size={12} className="text-blue-500" /> {t('projects').toUpperCase()}
              </label>
              <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                <option value="">{t('placeholder_project')}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={handleExport}
              disabled={loading || !selectedProjectId}
              className="bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 uppercase tracking-widest active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <FileDown size={20} />
                  {t('export_excel').toUpperCase()}
                </>
              )}
            </button>
          </div>

          <div className="mt-8 md:mt-12 p-4 md:p-6 bg-slate-50 rounded-2xl border border-slate-200 border-dashed">
            <div className="flex items-center gap-3 text-slate-400 mb-4">
              <Filter size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">{t('export_rules')}</span>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>
                <p className="text-[11px] md:text-xs text-slate-600 leading-relaxed font-medium">
                  <span className="font-bold text-slate-900">{t('permission_feat')}</span> {t('super_admin_export')}
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>
                <p className="text-[11px] md:text-xs text-slate-600 leading-relaxed font-medium">
                  <span className="font-bold text-slate-900">{t('format')}</span> {t('export_desc')}
                </p>
              </li>
            </ul>
          </div>
      </div>
    </div>
  );
}
