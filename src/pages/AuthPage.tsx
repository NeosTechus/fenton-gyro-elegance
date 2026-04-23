import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getRoleForEmail } from "@/lib/roles";
import { toast } from "sonner";
import { ArrowLeft, Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const AuthPage = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  // Hide sign-up for staff login pages (POS, Kiosk, Kitchen, Admin)
  const isStaffLogin = redirectTo && ["/pos", "/kiosk", "/kitchen", "/admin", "/settings"].includes(redirectTo);
  const showSignUp = !isStaffLogin;

  const getPostLoginRoute = (email: string) => {
    const lower = email.toLowerCase();
    const role = getRoleForEmail(email);

    // Admin and chef always go to their dashboard regardless of redirect
    if (role === "admin") return "/admin";
    if (role === "chef") return "/kitchen";

    // Staff accounts go to their specific page
    if (lower === "kiosk@fentongyro.com") return "/kiosk";
    if (lower === "pos@fentongyro.com") return "/pos";

    // Customers follow the redirect param or go home
    if (redirectTo) return redirectTo;
    return "/";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        toast.success("Welcome back!");
        navigate(getPostLoginRoute(email));
      } else {
        await signUp(email, password, displayName);
        toast.success("Account created! Check your email to verify.");
        if (redirectTo) navigate(redirectTo);
      }
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      if (redirectTo) navigate(redirectTo);
    } catch (error: any) {
      toast.error(error.message || "Google sign-in failed");
    }
  };

  return (
    <>
      {!isStaffLogin && <Navbar />}
      <main className={`${isStaffLogin ? "" : "pt-20"} min-h-screen flex flex-col items-center justify-center section-padding bg-background`}>
        {/* Back to Home — hidden on staff (kiosk/POS) logins */}
        {!isStaffLogin && (
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 self-center"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        )}

        {/* Card */}
        <div className="w-full max-w-md bg-card border border-border rounded-sm p-8 animate-fade-up">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="font-serif text-2xl md:text-3xl font-medium mb-1">
              {isStaffLogin ? "Staff Login" : "Welcome"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isStaffLogin ? "Sign in with your staff credentials" : "Sign in to track orders and enjoy faster checkout"}
            </p>
          </div>

          {/* Tab toggle — hidden for staff login */}
          {showSignUp && (
          <div className="flex bg-muted rounded-sm p-1 mb-6">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all active:scale-[0.97] ${
                mode === "signin"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-sans font-semibold uppercase tracking-wider rounded-sm transition-all active:scale-[0.97] ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Sign Up
            </button>
          </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && showSignUp && (
              <div>
                <label className="block text-sm font-sans font-semibold text-foreground mb-1.5">
                  Display Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <input
                    type="text"
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-sans font-semibold text-foreground mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-11 py-3 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {loading
                ? "Please wait…"
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.15em] font-sans font-semibold">
              Or continue with
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-border rounded-sm text-sm font-sans font-semibold hover:bg-muted active:scale-[0.97] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Guest note — hidden for staff login */}
        {!isStaffLogin && (
          <p className="text-sm text-muted-foreground mt-6 text-center">
            You can also checkout as a guest and create an account later
          </p>
        )}
      </main>
      {!isStaffLogin && <Footer />}
    </>
  );
};

export default AuthPage;
