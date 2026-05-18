import React, { useState, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Dashboard from './components/Dashboard';
import CompanyDirectory from './components/CompanyDirectory';
import TimesheetEntry from './components/TimesheetEntry';
import ProjectManagement from './components/ProjectManagement';
import Login from './components/Login';
import Register from './components/Register';
import ReportView from './components/ReportView';
import ProgressTracking from './components/ProgressTracking';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { isPlaceholder } from './lib/firebase';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNewProjectTriggered, setIsNewProjectTriggered] = useState(false);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  if (loading) return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-900">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user) {
    return isRegistering ? (
      <Register onSwitchLogin={() => setIsRegistering(false)} />
    ) : (
      <Login onSwitchRegister={() => setIsRegistering(true)} />
    );
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return t('dashboard');
      case 'projects': return t('projects');
      case 'timesheet': return t('timesheet');
      case 'reports': return t('reports');
      case 'logs': return t('audit_logs');
      case 'progress': return t('progress_tracking');
      case 'employees': return t('employees');
      default: return t('dashboard');
    }
  };

  return (
    <div className="bg-slate-50 text-slate-900 w-full h-screen overflow-hidden flex font-sans select-none relative">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          setActiveId(undefined);
          setIsSidebarOpen(false);
        }} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {isPlaceholder && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest z-50">
            <AlertTriangle size={12} />
            Firebase setup required: Please accept terms in the setup UI to enable full functionality.
          </div>
        )}
        <Header 
          title={getTitle()} 
          onMenuClick={() => setIsSidebarOpen(true)}
          onCreateProject={() => {
            setActiveTab('projects');
            setIsNewProjectTriggered(true);
          }}
        />
        
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  onTabChange={(tab, id) => {
                    setActiveTab(tab);
                    setActiveId(id);
                  }}
                />
              )}
              {activeTab === 'projects' && (
                <ProjectManagement 
                  triggerNewProject={isNewProjectTriggered} 
                  onTriggerProcessed={() => setIsNewProjectTriggered(false)} 
                  onViewProgress={(id) => {
                    setActiveTab('progress');
                    setActiveId(id);
                  }}
                />
              )}
              {activeTab === 'employees' && <CompanyDirectory initialSearchTerm={activeId} />}
              {activeTab === 'progress' && <ProgressTracking initialProjectId={activeId} onBack={() => setActiveTab('projects')} />}
              {activeTab === 'timesheet' && (
                <div className="p-4 md:p-8 flex flex-col lg:flex-row gap-8 min-h-full max-w-2xl mx-auto w-full justify-center">
                  <div className="w-full">
                    <TimesheetEntry 
                      onCancel={() => setActiveTab('dashboard')} 
                      onSubmit={() => setActiveTab('dashboard')} 
                    />
                  </div>
                </div>
              )}
              {activeTab === 'reports' && <ReportView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <motion.button 
        drag
        dragMomentum={false}
        dragElastic={0.1}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowTimesheetModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl flex items-center justify-center lg:hidden z-40 ring-4 ring-blue-500/10 cursor-grab active:cursor-grabbing"
      >
        <Plus size={24} />
      </motion.button>

      <AnimatePresence>
        {showTimesheetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTimesheetModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg z-10"
            >
              <TimesheetEntry 
                onCancel={() => setShowTimesheetModal(false)} 
                onSubmit={() => setShowTimesheetModal(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
