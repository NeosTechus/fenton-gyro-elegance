import { Order } from "@/data/orders";

interface CostAnalyticsProps {
  orders: Order[];
}

const CostAnalytics = ({ orders }: CostAnalyticsProps) => {
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const stripeFees = totalRevenue * 0.029 + orders.length * 0.3;
  const netRevenue = totalRevenue - stripeFees;
  const margin = totalRevenue > 0 ? (netRevenue / totalRevenue) * 100 : 0;
  const monthlyProjection = totalRevenue * 4.3; // rough weekly to monthly

  const costs = [
    { label: "Stripe Fees", value: `$${stripeFees.toFixed(2)}`, sub: `2.9% + $0.30/txn`, dot: "bg-accent" },
    { label: "Hosting", value: "$0.00", sub: "Free tier", dot: "bg-muted-foreground" },
    { label: "Database", value: "$0.00", sub: "Free tier", dot: "bg-primary" },
    { label: "Emails", value: "$0.00", sub: `${orders.length} sent`, dot: "bg-gold" },
  ];

  const usageBars = [
    { label: "Hosting Usage", pct: 0.1 },
    { label: "Database Storage", pct: 0.0 },
    { label: "Email Quota", pct: 0.7 },
  ];

  return (
    <div className="bg-card border border-border rounded-sm p-6 space-y-6">
      <div>
        <h3 className="font-serif text-lg font-medium">Cost & Usage Analytics</h3>
        <p className="text-xs text-muted-foreground mt-1">Estimated operational costs and projections</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {costs.map((c) => (
          <div key={c.label} className="bg-background border border-border rounded-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${c.dot}`} />
              <span className="text-xs text-muted-foreground font-sans">{c.label}</span>
            </div>
            <p className="text-lg font-sans font-bold text-foreground">{c.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Free Tier Usage
        </p>
        <div className="space-y-3">
          {usageBars.map((bar) => (
            <div key={bar.label}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{bar.label}</span>
                <span>{bar.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(bar.pct, 0.5)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-accent/10 border border-accent/20 rounded-sm p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Operational Cost</p>
          <p className="text-xl font-sans font-bold text-accent">${stripeFees.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">${(stripeFees / Math.max(orders.length, 1)).toFixed(2)}/order</p>
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-sm p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Net Revenue</p>
          <p className="text-xl font-sans font-bold text-primary">${netRevenue.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{margin.toFixed(1)}% margin</p>
        </div>
        <div className="bg-gold/10 border border-gold/20 rounded-sm p-4 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Monthly Projection</p>
          <p className="text-xl font-sans font-bold text-gold">${monthlyProjection.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">~{Math.round(orders.length * 4.3)} orders</p>
        </div>
      </div>
    </div>
  );
};

export default CostAnalytics;
