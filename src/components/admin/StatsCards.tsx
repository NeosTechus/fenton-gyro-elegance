import { ShoppingBag, DollarSign, TrendingUp, Users } from "lucide-react";
import { Order } from "@/data/orders";

interface StatsCardsProps {
  orders: Order[];
}

const StatsCards = ({ orders }: StatsCardsProps) => {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const activeOrders = orders.filter(
    (o) => !["completed", "cancelled"].includes(o.status)
  ).length;

  const todayOrders = orders.filter(
    (o) => new Date(o.created_at).toDateString() === new Date().toDateString()
  ).length;
  const todayRevenue = orders
    .filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, o) => sum + o.total, 0);

  const cards = [
    {
      label: "Total Orders",
      value: totalOrders.toString(),
      sub: `${todayOrders} today`,
      icon: ShoppingBag,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Total Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      sub: `$${todayRevenue.toFixed(2)} today`,
      icon: DollarSign,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Avg Order Value",
      value: `$${avgOrderValue.toFixed(2)}`,
      sub: "Per order average",
      icon: TrendingUp,
      color: "text-gold",
      bg: "bg-gold/10",
    },
    {
      label: "Active Orders",
      value: activeOrders.toString(),
      sub: "Pending completion",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card border border-border rounded-sm p-5 hover-lift"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-sans font-semibold text-muted-foreground uppercase tracking-wider">
              {card.label}
            </span>
            <div className={`w-8 h-8 rounded-sm ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>
          <p className="text-2xl font-sans font-bold text-foreground">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;
