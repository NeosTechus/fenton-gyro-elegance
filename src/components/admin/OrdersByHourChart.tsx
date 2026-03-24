import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Order } from "@/data/orders";

interface OrdersByHourChartProps {
  orders: Order[];
}

const OrdersByHourChart = ({ orders }: OrdersByHourChartProps) => {
  const hourCounts = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    orders: orders.filter((o) => new Date(o.created_at).getHours() === h).length,
  }));

  // Only show hours 8am-11pm
  const filtered = hourCounts.filter((_, i) => i >= 8 && i <= 23);

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <h3 className="font-serif text-lg font-medium mb-6">Orders by Hour</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={filtered}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 18%, 82%)" />
          <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="hsl(30, 8%, 48%)" />
          <YAxis tick={{ fontSize: 12 }} stroke="hsl(30, 8%, 48%)" allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "hsl(39, 32%, 96%)",
              border: "1px solid hsl(35, 18%, 82%)",
              borderRadius: "4px",
              fontSize: 13,
            }}
          />
          <Bar dataKey="orders" fill="hsl(142, 28%, 28%)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default OrdersByHourChart;
