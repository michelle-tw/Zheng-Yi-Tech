import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { UserPlus, User, Lock, AlertCircle, ArrowLeft, BadgeCheck, Languages } from 'lucide-react';
import { UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../services/auditService';

export default function Register({ onSwitchLogin }: { onSwitchLogin: () => void }) {
  const { t, i18n } = useTranslation();
  const { loginWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('vi') ? 'zh' : 'vi';
    i18n.changeLanguage(newLang);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) {
      setError(i18n.language.startsWith('vi') ? 'Mật khẩu phải có ít nhất 6 ký tự' : '密碼長度必須至少為 6 個字元');
      return;
    }

    if (password !== confirmPassword) {
      setError(t('password_mismatch'));
      return;
    }

    setLoading(true);
    try {
      if (!auth || !db) throw new Error(t('firebase_error'));
      // Use dummy email domain for username-based auth in Firebase
      const email = `${username.trim().toLowerCase()}@protheme.com`;
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      
      // Immediately set display name for Auth user as fallback
      await updateProfile(user, { displayName: fullName });

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        full_name: fullName,
        username: username.trim(),
        password: password, // Plaintext storage per user requirement for Super Admin visibility
        role: UserRole.EMPLOYEE,
        preferred_lang: i18n.language.startsWith('vi') ? 'vi' : 'zh',
        is_active: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });

      // Log the registration
      await logAction(username, UserRole.EMPLOYEE, 'REGISTER', user.uid, null, { username, full_name: fullName, role: UserRole.EMPLOYEE });
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setError(i18n.language.startsWith('vi') 
          ? 'Đăng ký bằng Email/Mật khẩu chưa được bật trong Firebase Console. Vui lòng bật nó trong phần Authentication > Sign-in method.'
          : 'Firebase 控制台中尚未啟用電子郵件/密碼註冊。請在“身份驗證”>“登錄方法”部分中啟用它。');
      } else {
        setError(err.message === 'Firebase: Error (auth/email-already-in-use).' ? t('user_exists') : err.message);
      }
      console.error(err);
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-slate-800/20 rounded-full blur-3xl -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl -ml-48 -mb-48" />

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
          <div className="bg-slate-800 px-8 py-8 text-white relative">
            <button 
              onClick={onSwitchLogin}
              className="absolute left-6 top-8 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="text-center">
              <h1 className="text-xl font-black tracking-tight uppercase italic">{t('register')}</h1>
              <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-bold">
                {t('create_employee')}
              </p>
            </div>
          </div>
          
          <div className="p-8 space-y-5">
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <BadgeCheck size={12} /> {t('full_name')}
                  </label>
                  <input 
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="王小明"
                  />
                </div>

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
                    placeholder="xiaoming_123"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Lock size={12} /> {t('password')}
                    </label>
                    <input 
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                      <Lock size={12} /> {t('confirm_password')}
                    </label>
                    <input 
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
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
                className="w-full bg-slate-900 hover:bg-black text-white font-black py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
              >
                <UserPlus size={18} />
                {loading ? t('processing') : t('register').toUpperCase()}
              </button>
            </form>

            <div className="relative flex items-center py-1">
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
              {i18n.language.startsWith('vi') ? 'Đăng ký với Google' : '使用 Google 註冊'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
