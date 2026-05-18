import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, Menu } from 'lucide-react';

export default function Header({ 
  title, 
  onCreateProject, 
  onMenuClick 
}: { 
  title: string, 
  onCreateProject?: () => void,
  onMenuClick?: () => void
}) {
  const { t } = useTranslation();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-800 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg md:text-xl font-bold text-slate-800 uppercase tracking-tighter">
          {title}
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative group hidden md:block">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
            <Search size={14} />
          </div>
          <input 
            type="text" 
            placeholder={t('search_projects')} 
            className="bg-slate-100 border-none rounded-full pl-9 pr-4 py-1.5 text-xs w-48 lg:w-64 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
          />
        </div>
        
        <button 
          onClick={onCreateProject}
          className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-3 md:px-4 py-2 rounded-md font-bold uppercase tracking-widest flex items-center gap-2 transition-colors active:scale-95"
        >
          <Plus size={14} className="shrink-0" />
          <span className="hidden sm:inline">{t('create_project')}</span>
          <span className="sm:hidden">{t('new')}</span>
        </button>
      </div>
    </header>
  );
}
