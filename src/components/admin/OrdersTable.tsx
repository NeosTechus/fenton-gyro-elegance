import { useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { Order, OrderStatus } from "@/data/orders";

interface OrdersTableProps {
  orders: Order[];
  onStatusChange: (id: string, status: OrderStatus) => void;
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  received: "bg-red-100 text-red-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUS_ICONS: Record<OrderStatus, string> = {
  pending: "⏳",
  received: "📥",
  preparing: "🔥",
  ready: "✅",
  completed: "✓",
  cancelled: "✕",
};

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

const OrdersTable = ({ orders, onStatusChange }: OrdersTableProps) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.items.some((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-card border border-border rounded-sm">
      <div className="p-6 border-b border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h3 className="font-serif text-xl font-medium">Orders</h3>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-52 pl-9 pr-4 py-2 bg-background border border-border rounded-sm text-sm font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-shadow"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 bg-background border border-border rounded-sm text-sm font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="received">Received</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Order ID</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Customer</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Items</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Total</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Prep Time</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Created</th>
              <th className="text-left px-5 py-3 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{order.id}</td>
                <td className="px-5 py-4">
                  <p className="font-sans font-semibold text-foreground text-sm">{order.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                </td>
                <td className="px-5 py-4 text-xs text-muted-foreground max-w-[200px]">
                  {order.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                </td>
                <td className="px-5 py-4 font-sans font-semibold">${order.total.toFixed(2)}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-sans font-semibold ${STATUS_STYLES[order.status]}`}>
                    {STATUS_ICONS[order.status]} {order.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="relative">
                    <select
                      defaultValue={order.prep_time}
                      className="appearance-none pl-2 pr-6 py-1 bg-muted border border-border rounded-sm text-xs font-sans cursor-pointer focus:outline-none"
                    >
                      {PREP_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}m</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(order.created_at).toLocaleString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </td>
                <td className="px-5 py-4">
                  <div className="relative">
                    <select
                      value={order.status}
                      onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)}
                      className="appearance-none pl-2 pr-7 py-1.5 bg-background border border-border rounded-sm text-xs font-sans font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      <option value="pending">Pending</option>
                      <option value="received">Received</option>
                      <option value="preparing">Preparing</option>
                      <option value="ready">Ready</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No orders found.
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersTable;
