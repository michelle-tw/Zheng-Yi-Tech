import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Briefcase, Calendar, User, Search, Save, X, Trash2, ChevronDown, Pencil, AlertCircle, CheckCircle } from 'lucide-react';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Project, ProjectStatus } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../services/auditService';
import { AnimatePresence, motion } from 'motion/react';

import { handleFirestoreError, OperationType } from '../lib/utils';

export default function ProjectManagement({ 
  triggerNewProject = false, 
  onTriggerProcessed,
  onViewProgress
}: { 
  triggerNewProject?: boolean; 
  onTriggerProcessed?: () => void;
  onViewProgress?: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const { isSuperAdmin, isAdmin, profile, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProject, setCurrentProject] = useState<Partial<Project>>({
    name: '',
    responsible_person: '',
    status: ProjectStatus.RUNNING,
    expect_h: undefined
  });
  const [showSuccess, setShowSuccess] = useState<string | null>(null);
  const [workerNames, setWorkerNames] = useState<string[]>([]);

  useEffect(() => {
    if (triggerNewProject) {
      setCurrentProject({ name: '', status: ProjectStatus.RUNNING, expect_h: undefined });
      setIsEditing(true);
      onTriggerProcessed?.();
    }
  }, [triggerNewProject]);

  useEffect(() => {
    if (!db || !user) return;
    
    const unsubWorkerNames = onSnapshot(collection(db, 'worker_names'), (snapshot) => {
      const names = snapshot.docs.map(doc => doc.data().name as string).filter(n => n !== '施杰倫');
      const initialNames = ['羅善文', '黃銘宗', '李柏翰', '張育祥', '謝鴻宇', '魏士鈞', '施杰綸', '梁寶銘'];
      const combined = Array.from(new Set([...initialNames, ...names]));
      setWorkerNames(combined);
    });

    const handleClickOutside = (e: MouseEvent) => {
      // Cleaned up unused suggestions logic
    };
    document.addEventListener('mousedown', handleClickOutside);

    const q = query(collection(db, 'projects'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });
    return () => {
      unsubscribe?.();
      unsubWorkerNames?.();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db) return;

    try {
      const { id, ...cleanData } = currentProject;
      const projectData = {
        ...cleanData,
        responsible_person: cleanData.responsible_person || '',
        expect_h: cleanData.expect_h || 0,
        updated_at: serverTimestamp()
      };

      if (id) {
        const docRef = doc(db, 'projects', id);
        const oldProject = projects.find(p => p.id === id);
        
        await updateDoc(docRef, projectData);
        
        if (profile) {
          await logAction(profile.username, profile.role, 'UPDATE_PROJECT', id, oldProject, projectData);
        }
      } else {
        const docRef = await addDoc(collection(db, 'projects'), {
          ...projectData,
          created_at: serverTimestamp()
        });
        if (profile) {
          await logAction(profile.username, profile.role, 'CREATE_PROJECT', docRef.id, null, projectData);
        }
      }
      setIsEditing(false);
      setCurrentProject({ name: '', status: ProjectStatus.RUNNING, expect_h: undefined });
      setShowSuccess(id ? t('update_success') : t('add_success'));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('delete_confirm')) || !db) return;
    try {
      const oldProject = projects.find(p => p.id === id);
      await deleteDoc(doc(db, 'projects', id));
      if (profile) {
        await logAction(profile.username, profile.role, 'DELETE_PROJECT', id, oldProject, null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${id}`);
    }
  };

  return (
    <div className="p-4 md:p-8 font-sans h-full">
      <div className="max-w-[1600px] mx-auto w-full space-y-6 lg:space-y-10">
        <div className="flex justify-end pt-4">
        <button 
          onClick={() => {
            setCurrentProject({ name: '', description: '', status: ProjectStatus.RUNNING, expect_h: undefined });
            setIsEditing(true);
          }}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <Plus size={16} />
          {t('new_project')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
        {projects.map((project) => (
          <div key={project.id} className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl lg:rounded-[40px] p-5 md:p-6 lg:p-8 shadow-sm hover:shadow-xl transition-all group">
            <div className="flex justify-between items-start mb-4 md:mb-6 lg:mb-8">
              <div className="w-10 h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 bg-slate-50 rounded-xl md:rounded-2xl lg:rounded-3xl flex items-center justify-center text-blue-600 border border-slate-100 shadow-inner group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:rotate-6">
                <Briefcase size={24} />
              </div>
              <div className="flex gap-2">
                <span className={`px-2 py-1 rounded text-[8px] md:text-[9px] lg:text-xs font-black uppercase tracking-widest border ${
                  project.status === ProjectStatus.RUNNING ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                  project.status === ProjectStatus.FINISHED ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  {t(project.status.toLowerCase())}
                </span>
              </div>
            </div>

            <h3 className="text-base md:text-lg lg:text-3xl font-black text-slate-900 mb-1 lg:mb-2 uppercase group-hover:text-blue-600 transition-colors line-clamp-1 italic tracking-tight">{project.name}</h3>
            {project.responsible_person && (
              <p className="text-[10px] lg:text-sm xl:text-base font-black text-blue-600 uppercase italic mb-4 lg:mb-8 tracking-wide">@{project.responsible_person}</p>
            )}
            <p className="text-[10px] md:text-xs lg:text-base text-slate-400 mb-4 md:mb-6 lg:mb-10 line-clamp-2 leading-relaxed italic">{project.description || t('no_desc')}</p>

            <div className="space-y-4 pt-4 lg:pt-8 border-t border-slate-50">
              <div className="flex justify-between items-end">
                <div className="space-y-1 lg:space-y-2">
                  <p className="text-[8px] md:text-[9px] lg:text-sm font-black text-slate-300 uppercase tracking-widest italic">{t('expected_h')}</p>
                  <p className="text-xs md:text-sm lg:text-2xl font-black text-slate-900">{project.expect_h || 0}h</p>
                </div>
                <div className="flex gap-2 lg:gap-4">
                  <button 
                    onClick={() => {
                      if (onViewProgress) onViewProgress(project.id);
                    }}
                    title={t('view_details')}
                    className="p-2 lg:p-4 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl lg:rounded-2xl transition-all shadow-sm border border-transparent hover:border-emerald-100 flex items-center gap-2 font-bold text-xs"
                  >
                    {t('view_details')}
                  </button>
                  <button 
                    onClick={() => {
                      setCurrentProject(project);
                      setIsEditing(true);
                    }}
                    title={t('edit')}
                    className="p-2 lg:p-4 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl lg:rounded-2xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                  >
                    <Pencil size={20} />
                  </button>
                  <button 
                    onClick={() => handleDelete(project.id)}
                    title={t('delete')}
                    className="p-2 lg:p-4 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl lg:rounded-2xl transition-all shadow-sm border border-transparent hover:border-red-100"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200">
          <Briefcase size={40} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">{t('no_project_yet')}</p>
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsEditing(false)} />
          <form 
            onSubmit={handleSave}
            className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest italic">
                {currentProject.id ? t('update_project') : t('create_project')}
              </h3>
              <button type="button" onClick={() => setIsEditing(false)} className="hover:bg-slate-800 p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{t('project_name_label')}</label>
                <input 
                  type="text"
                  required
                  value={currentProject.name}
                  onChange={e => setCurrentProject({...currentProject, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  placeholder={t('project_name_placeholder') || ''}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{t('responsible_person')}</label>
                <div className="relative">
                  <select 
                    value={currentProject.responsible_person || ''}
                    onChange={e => setCurrentProject({...currentProject, responsible_person: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none pr-10"
                  >
                    <option value="">{t('select_responsible') || '---'}</option>
                    {workerNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{t('expected_h')}</label>
                  <input 
                    type="number"
                    required
                    value={currentProject.expect_h === undefined ? '' : currentProject.expect_h}
                    onChange={e => setCurrentProject({...currentProject, expect_h: e.target.value === '' ? undefined : Number(e.target.value)})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{t('expected_completion_date')}</label>
                  <input 
                    type="date"
                    value={currentProject.expected_completion_date || ''}
                    onChange={e => setCurrentProject({...currentProject, expected_completion_date: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 ml-1">{t('status')}</label>
                <div className="relative">
                  <select 
                    value={currentProject.status}
                    onChange={e => setCurrentProject({...currentProject, status: e.target.value as ProjectStatus})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold appearance-none pr-10"
                  >
                    <option value={ProjectStatus.RUNNING}>{t('running')}</option>
                    <option value={ProjectStatus.FINISHED}>{t('finished')}</option>
                    <option value={ProjectStatus.LOCKED}>{t('locked')}</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 mt-4 uppercase tracking-widest italic active:scale-95 disabled:opacity-50 disabled:grayscale"
              >
                <Save size={18} />
                {t('save_project')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Success Popup */}
      <AnimatePresence>
        {showSuccess && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSuccess(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative bg-white rounded-[32px] p-10 text-center space-y-6 flex flex-col items-center justify-center min-h-[300px] max-w-sm w-full mx-auto shadow-2xl"
            >
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center shadow-inner border border-emerald-100">
                <CheckCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900 uppercase italic leading-none">{showSuccess}</h3>
                <p className="text-sm text-slate-500 font-medium italic">{t('data_updated_immediately')}</p>
              </div>
              <button 
                onClick={() => setShowSuccess(null)}
                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
              >
                {t('confirm')}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
