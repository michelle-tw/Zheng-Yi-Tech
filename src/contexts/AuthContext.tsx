import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  logout: () => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  logout: async () => {},
  login: async () => {},
  loginWithGoogle: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      const publicProfile: UserProfile = {
        uid: 'public-admin',
        full_name: 'Zheng Yi Tech',
        username: 'zhengyitech',
        role: UserRole.EMPLOYEE,
        preferred_lang: 'zh',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setProfile(publicProfile);
      setUser({ uid: 'public-admin', email: 'admin@public.com' } as any);
      setLoading(false);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        // Automatically set a public admin user if not logged in
        const publicProfile: UserProfile = {
          uid: 'public-admin',
          full_name: 'Zheng Yi Tech',
          username: 'zhengyitech',
          role: UserRole.EMPLOYEE,
          preferred_lang: 'zh',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setProfile(publicProfile);
        setUser({ uid: 'public-admin', email: 'admin@public.com' } as any);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || !db) {
      setProfile(null);
      return;
    }

    setLoading(true);

    // Listen to user profile
    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setLoading(false);
    });

    // Automatically upgrade role for hardcoded admins
    const hardcodedAdmins = [
      'thanhhoa.tran10062001@gmail.com', 
      'admin@protheme.com', 
      'superadmin@protheme.com'
    ];
    const superAdmins = [
      'thanhhoa.tran10062001@gmail.com',
      'superadmin@protheme.com'
    ];
    
    if (user.email && hardcodedAdmins.includes(user.email)) {
      getDoc(doc(db, 'users', user.uid)).then(async (docSnap) => {
        const expectedRole = superAdmins.includes(user.email!) ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
        if (!docSnap.exists()) {
          // Create missing profile for hardcoded admin
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            full_name: user.displayName || user.email?.split('@')[0] || 'Admin',
            username: user.email?.split('@')[0] || 'admin',
            role: expectedRole,
            preferred_lang: 'vi',
            is_active: true,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        } else if (docSnap.data()?.role !== expectedRole) {
          await setDoc(doc(db, 'users', user.uid), { role: expectedRole }, { merge: true });
        }
      });
    }

    return () => unsubscribeProfile();
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;

    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          last_active_at: serverTimestamp()
        });
      } catch (err) {
        // Silently fail to not interrupt UX
        console.warn("Presence update failed", err);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 3 * 60 * 1000); // Every 3 mins

    return () => clearInterval(interval);
  }, [user]);

  const loginWithGoogle = async () => {
    if (!auth || !db) return;
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if profile exists, if not create one
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists()) {
        const email = user.email || '';
        let role = UserRole.EMPLOYEE;
        if (email === 'thanhhoa.tran10062001@gmail.com') role = UserRole.SUPER_ADMIN;
        // removed jielun_0514 from admin fallback as per user request

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          full_name: user.displayName || 'User',
          username: user.email?.split('@')[0] || user.uid,
          role: role,
          preferred_lang: 'vi',
          is_active: true,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Google login error:", error);
      throw error;
    }
  };

  const login = async (emailOrUsername: string, pass: string) => {
    const cleanInput = emailOrUsername.trim().toLowerCase();
    const isMockAdmin = cleanInput === 'admin' && pass === '123456789';
    const isMockSuper = cleanInput === 'superadmin' && pass === '123456789';

    if (auth) {
      let finalEmail = cleanInput;
      if (!cleanInput.includes('@')) {
        finalEmail = `${cleanInput}@protheme.com`;
      }
      
      try {
        return await signInWithEmailAndPassword(auth, finalEmail, pass);
      } catch (err: any) {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          if (isMockAdmin || isMockSuper) {
            // Local bypass for critical test accounts
            const mockUid = isMockSuper ? 'mock-super-admin' : 'mock-admin';
            const mockProfile: UserProfile = {
              uid: mockUid,
              full_name: isMockSuper ? 'Super Admin' : 'Administrator',
              username: cleanInput,
              role: isMockSuper ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
              preferred_lang: 'vi',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            setProfile(mockProfile);
            setUser({ uid: mockUid, email: `${cleanInput}@protheme.com` } as any);
            localStorage.setItem('mock_user', JSON.stringify({ profile: mockProfile }));
            return;
          }
        }
        throw err;
      }
    } else {
      // Offline/Mock mode
      if (isMockAdmin || isMockSuper) {
        // Same logic as above...
        const mockUid = isMockSuper ? 'mock-super-admin' : 'mock-admin';
        const mockProfile: UserProfile = {
          uid: mockUid,
          full_name: isMockSuper ? 'Super Admin' : 'Administrator',
          username: cleanInput,
          role: isMockSuper ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
          preferred_lang: 'vi',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setProfile(mockProfile);
        setUser({ uid: mockUid, email: `${cleanInput}@protheme.com` } as any);
        localStorage.setItem('mock_user', JSON.stringify({ profile: mockProfile }));
        return;
      }
      throw new Error("Login failed (no firebase configuration)");
    }
  };

  const logout = async () => {
    try {
      if (auth) {
        await signOut(auth);
      }
    } catch (error) {
      console.error("Logout error:", error);
    }
    localStorage.removeItem('mock_user');
    setProfile(null);
    setUser(null);
  };

  const isAdminMode = profile?.role === UserRole.ADMIN || 
                    profile?.role === UserRole.SUPER_ADMIN || 
                    ['thanhhoa.tran10062001@gmail.com', 'admin@protheme.com', 'superadmin@protheme.com'].includes(user?.email || '');

  const isSuperAdminMode = profile?.role === UserRole.SUPER_ADMIN || 
                         ['thanhhoa.tran10062001@gmail.com', 'superadmin@protheme.com'].includes(user?.email || '');

  const value = {
    user,
    profile,
    loading,
    isAdmin: isAdminMode,
    isSuperAdmin: isSuperAdminMode,
    logout,
    login,
    loginWithGoogle,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
