import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile as firebaseUpdateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { AppRole, getRoleForEmail } from "@/lib/roles";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: AppRole;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<Profile, "display_name" | "avatar_url" | "phone">>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

const googleProvider = new GoogleAuthProvider();

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (u: User) => {
    if (!db) return;
    const ref = doc(db, "profiles", u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      setProfile({ id: u.uid, ...snap.data() } as Profile);
    } else {
      const newProfile: Profile = {
        id: u.uid,
        display_name: u.displayName || null,
        avatar_url: u.photoURL || null,
        phone: u.phoneNumber || null,
        created_at: new Date().toISOString(),
      };
      await setDoc(ref, newProfile);
      setProfile(newProfile);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          await fetchProfile(u);
        } catch (err) {
          console.warn("Could not fetch profile:", err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!auth) throw new Error("Firebase not configured");
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    await firebaseUpdateProfile(newUser, { displayName });
  };

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase not configured");
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    if (!auth) throw new Error("Firebase not configured");
    await signInWithPopup(auth, googleProvider);
  };

  const signOut = async () => {
    if (!auth) throw new Error("Firebase not configured");
    await firebaseSignOut(auth);
  };

  const updateProfileData = async (
    updates: Partial<Pick<Profile, "display_name" | "avatar_url" | "phone">>
  ) => {
    if (!user || !db) throw new Error("Not authenticated");
    const ref = doc(db, "profiles", user.uid);
    await updateDoc(ref, updates);
    await fetchProfile(user);
  };

  const role = getRoleForEmail(user?.email);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        updateProfile: updateProfileData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
