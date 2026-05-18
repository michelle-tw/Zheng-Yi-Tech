import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { 
  BarChart3, 
  Briefcase, 
  Clock, 
  Users, 
  CheckCircle2, 
  History, 
  FileText,
  LogOut,
  Languages,
  X,
  TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string | number;
}

const NavItem = ({ icon, label, active, onClick, badge }: NavItemProps) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-3 py-2.5 lg:py-3.5 rounded-xl lg:rounded-2xl text-sm lg:text-base transition-colors group",
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
        : "text-slate-400 hover:bg-slate-800 hover:text-white"
    )}
  >
    <span className={cn("transition-colors", active ? "text-white" : "group-hover:text-white")}>
      {React.cloneElement(icon as React.ReactElement, { size: 20 })}
    </span>
    <span className="font-bold whitespace-nowrap lg:tracking-tight">{label}</span>
    {badge !== undefined && (
      <span className="ml-auto bg-blue-500 text-[10px] lg:text-xs px-2 py-0.5 rounded-full text-white font-black">
        {badge}
      </span>
    )}
  </button>
);

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ activeTab, onTabChange, isOpen, onClose }: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { profile, user, isSuperAdmin, isAdmin, logout } = useAuth();
  const currentLang = i18n.language;

  const toggleLang = () => {
    i18n.changeLanguage(currentLang.startsWith('vi') ? 'zh' : 'vi');
  };

  const handleLogout = () => {
    logout();
  };

  let displayName = profile?.full_name || user?.displayName || t('guest');
  if (displayName.toLowerCase() === 'public administrator') {
    displayName = 'ZhengYi Company';
  }
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 lg:w-72 bg-slate-900 text-white flex flex-col shrink-0 h-screen border-r border-slate-800 z-[70] transition-transform duration-300 lg:relative lg:translate-x-0",
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-sm shadow-inner shadow-white/20">
              正易
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-lg leading-tight uppercase overflow-hidden">
                正易科技
              </span>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black leading-none mt-0.5">
                {t('engineering_solutions')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-slate-500 hover:text-white lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-3 py-2">
          {t('menu')}
        </div>
        <NavItem 
          icon={<BarChart3 size={18} />} 
          label={t('dashboard')} 
          active={activeTab === 'dashboard'} 
          onClick={() => onTabChange('dashboard')} 
        />
        <NavItem 
          icon={<Briefcase size={18} />} 
          label={t('projects')} 
          active={activeTab === 'projects'}
          onClick={() => onTabChange('projects')} 
        />
        <NavItem 
          icon={<Users size={18} />} 
          label={t('employees')} 
          active={activeTab === 'employees'}
          onClick={() => onTabChange('employees')} 
        />
        <NavItem 
          icon={<Clock size={18} />} 
          label={t('timesheet')} 
          active={activeTab === 'timesheet'}
          onClick={() => onTabChange('timesheet')} 
        />
        <NavItem 
          icon={<FileText size={18} />} 
          label={t('reports')} 
          active={activeTab === 'reports'}
          onClick={() => onTabChange('reports')} 
        />
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-4">
        <button 
          onClick={toggleLang}
          className="w-full flex items-center justify-between px-3 py-2 rounded bg-slate-800 text-[10px] font-bold text-slate-400 hover:bg-slate-700 hover:text-white transition-all uppercase tracking-widest group"
        >
          <div className="flex items-center gap-2">
            <Languages size={14} className="group-hover:text-blue-400 transition-colors" />
            <span>{t('select_lang')}</span>
          </div>
          <span className="text-blue-500">{currentLang.startsWith('vi') ? '🇻🇳 VI' : '🇹🇼 ZH'}</span>
        </button>

        <div className="flex flex-col gap-2 bg-slate-800/30 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-3 p-1">
            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center border border-slate-600 shrink-0 font-bold text-blue-400 text-xs shadow-inner uppercase">
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold truncate text-white">{displayName}</p>
              <p className="text-[9px] text-blue-400 font-mono uppercase tracking-tighter font-bold opacity-80">
                {t(profile?.role?.toLowerCase() || 'employee')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </>
);
}
