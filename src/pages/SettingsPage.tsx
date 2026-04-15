import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Wifi,
  WifiOff,
  RefreshCw,
  Loader2,
  Settings,
  Monitor,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  ValorEPI,
  getEPIs,
  addEPI,
  removeEPI,
  updateEPI,
  refreshAllStatuses,
  resetToDefaults,
} from "@/lib/valor-epi";

const SettingsPage = () => {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();
  const [epis, setEpis] = useState<ValorEPI[]>([]);
  const [checking, setChecking] = useState(false);

  // New EPI form
  const [newLabel, setNewLabel] = useState("");
  const [newId, setNewId] = useState("");
  const [newWsUrl, setNewWsUrl] = useState("ws://");

  useEffect(() => {
    setEpis(getEPIs());
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth?redirect=/settings" replace />;
  if (role !== "admin") return <Navigate to="/" replace />;

  const handleAdd = () => {
    if (!newLabel.trim() || !newId.trim() || !newWsUrl.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    const updated = addEPI({ id: newId.trim(), label: newLabel.trim(), wsUrl: newWsUrl.trim() });
    setEpis(updated);
    setNewLabel("");
    setNewId("");
    setNewWsUrl("ws://");
    toast.success("Terminal added");
  };

  const handleRemove = (id: string) => {
    const updated = removeEPI(id);
    setEpis(updated);
    toast.success("Terminal removed");
  };

  const handleRefresh = async () => {
    setChecking(true);
    const updated = await refreshAllStatuses();
    setEpis(updated);
    setChecking(false);
    const onlineCount = updated.filter((e) => e.online).length;
    toast.success(`${onlineCount}/${updated.length} terminals online`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 text-xs font-sans font-semibold text-primary-foreground/70 hover:text-primary-foreground active:scale-95 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <div className="h-4 w-px bg-primary-foreground/20" />
          <span className="font-serif text-sm font-medium">Fenton Gyro</span>
          <span className="text-[10px] uppercase tracking-wider font-sans font-semibold bg-primary-foreground/15 text-primary-foreground/80 px-2 py-0.5 rounded">
            Settings
          </span>
        </div>
        <Settings className="w-4 h-4 text-primary-foreground/50" />
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* Terminal Management */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-xl font-medium">Payment Terminals</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Manage Valor POS terminal endpoints (EPIs)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const defaults = resetToDefaults();
                  setEpis(defaults);
                  toast.success("Terminals reset to defaults");
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-semibold border border-border rounded-sm hover:bg-muted active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={handleRefresh}
                disabled={checking || epis.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-sans font-semibold border border-border rounded-sm hover:bg-muted active:scale-95 transition-all disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Check Status
              </button>
            </div>
          </div>

          {/* EPI list */}
          {epis.length === 0 ? (
            <div className="bg-card border border-border rounded-sm p-8 text-center">
              <Monitor className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No terminals configured</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add a terminal below to get started</p>
            </div>
          ) : (
            <div className="space-y-2 mb-6">
              {epis.map((epi) => (
                <div
                  key={epi.id}
                  className="bg-card border border-border rounded-sm p-4 flex items-center gap-4"
                >
                  <div className="shrink-0">
                    {epi.online ? (
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Wifi className="w-4 h-4 text-green-500" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <WifiOff className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans text-sm font-semibold">{epi.label}</h3>
                      <span className="text-[9px] uppercase tracking-wider font-sans font-semibold px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                        EPI {epi.id}
                      </span>
                      <span
                        className={`text-[9px] uppercase tracking-wider font-sans font-semibold px-1.5 py-0.5 rounded ${
                          epi.online
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {epi.online ? "Online" : "Offline"}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={epi.wsUrl}
                      onChange={(e) => {
                        const updated = updateEPI(epi.id, { wsUrl: e.target.value });
                        setEpis(updated);
                      }}
                      placeholder="ws://192.168.1.10:5000"
                      className="w-full mt-1.5 px-2 py-1 bg-background border border-border rounded-sm text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                    {epi.appKey && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono truncate">
                        APP KEY: {epi.appKey.slice(0, 8)}••••••••
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(epi.id)}
                    className="shrink-0 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-destructive active:scale-90 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new EPI */}
          <div className="bg-card border border-border rounded-sm p-4">
            <h3 className="font-sans text-sm font-semibold mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent" />
              Add Terminal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <input
                type="text"
                placeholder="Label (e.g. Front Counter)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="px-3 py-2.5 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <input
                type="text"
                placeholder="EPI ID"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="px-3 py-2.5 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <input
                type="text"
                placeholder="ws://192.168.1.10:5000"
                value={newWsUrl}
                onChange={(e) => setNewWsUrl(e.target.value)}
                className="px-3 py-2.5 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <button
              onClick={handleAdd}
              className="px-4 py-2.5 bg-accent text-accent-foreground font-sans font-semibold text-xs uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              Add Terminal
            </button>
          </div>
        </div>

        {/* Merchant Info (from Fiserv VAR Sheet) */}
        <div>
          <h2 className="font-serif text-xl font-medium mb-4">Merchant Information</h2>
          <div className="bg-card border border-border rounded-sm divide-y divide-border">
            {[
              ["Business Name", "Fenton Gyro LLC"],
              ["DBA", "GYRO/GYRO"],
              ["Address", "657 Gravois Rd, Fenton, MO 63026"],
              ["Phone", "(636) 600-1333"],
              ["Email", "gyrogyrollc@outlook.com"],
              ["Contact", "Sakar Sabir"],
              ["MCC", "5812 (Restaurant)"],
              ["North Merchant ID", "542623920132875"],
              ["Nashville Merchant ID", "9687420"],
              ["Terminal ID", "08399419"],
              ["Group ID", "10001"],
              ["Back End", "Omaha"],
              ["Front End", "Nashville Rapid Connect"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-muted-foreground font-sans">{label}</span>
                <span className="text-sm font-sans font-semibold text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
