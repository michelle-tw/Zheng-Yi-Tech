import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { LogIn, User, Lock, AlertCircle, Languages } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login({ onSwitchRegister }: { onSwitchRegister: () => void }) {
  const { t, i18n } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('vi') ? 'zh' : 'vi';
    i18n.changeLanguage(newLang);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(username, password);
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = i18n.language.startsWith('vi') 
        ? 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.' 
        : '登錄失敗。請檢查帳號和密碼。';
      
      if (err.code === 'auth/invalid-credential') {
        msg = i18n.language.startsWith('vi')
          ? 'Tài khoản hoặc mật khẩu không chính xác. Nếu bạn chưa có tài khoản, hãy đăng ký.'
          : '帳號或密碼錯誤。如果您還沒有帳號，請先註冊。';
      } else if (err.code === 'auth/user-not-found') {
        msg = i18n.language.startsWith('vi')
          ? 'Tài khoản không tồn tại. Vui lòng đăng ký trước.'
          : '帳號不存在。請先註冊。';
      }
      
      if (err.code === 'auth/operation-not-allowed') {
        msg = i18n.language.startsWith('vi') 
          ? 'Đăng nhập bằng Email/Mật khẩu chưa được bật trong Firebase Console.'
          : 'Firebase 控制台中尚未啟用電子郵件/密碼登錄。';
      }
      
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(t('login_failed'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl -ml-48 -mb-48" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex justify-end mb-4">
          <button 
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black text-white border border-white/10 transition-all uppercase tracking-widest"
          >
            <Languages size={14} className="text-blue-400" />
            <span>{i18n.language.startsWith('vi') ? '🇻🇳 TIẾNG VIỆT' : '🇹🇼 繁體中文'}</span>
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-blue-600 px-8 py-10 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent)]" />
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/30 relative z-10">
              <span className="text-3xl font-black">正易</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight uppercase relative z-10">正易科技有限公司</h1>
            <p className="text-blue-100 text-[10px] mt-2 opacity-80 uppercase tracking-widest font-black relative z-10 italic">
              {t('engineering_solutions')}
            </p>
          </div>
          
          <div className="p-8 space-y-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <User size={12} /> {t('username')}
                  </label>
                  <input 
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="admin"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Lock size={12} /> {t('password')}
                  </label>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-500 font-bold bg-red-50 p-3 rounded-lg border border-red-100 italic">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
              >
                <LogIn size={18} />
                {loading ? t('processing') : t('login')}
              </button>
            </form>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {i18n.language.startsWith('vi') ? 'Hoặc' : '或'}
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 font-black py-4 rounded-xl border-2 border-slate-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
              {i18n.language.startsWith('vi') ? 'Tiếp tục với Google' : '使用 Google 登錄'}
            </button>
            
            <div className="text-center pt-2">
              <button 
                type="button" 
                onClick={onSwitchRegister}
                className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest"
              >
                {t('register')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
