import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Order } from "@/data/orders";

interface RevenueChartProps {
  orders: Order[];
}

const RevenueChart = ({ orders }: RevenueChartProps) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const data = days.map((day) => {
    const dayOrders = orders.filter(
      (o) => new Date(o.created_at).toDateString() === day.toDateString()
    );
    const revenue = dayOrders.reduce((s, o) => s + o.total, 0);
    return {
      name: day.toLocaleDateString("en-US", { weekday: "short" }),
      revenue: Math.round(revenue * 100) / 100,
    };
  });

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <h3 className="font-serif text-lg font-medium mb-6">Revenue (Last 7 Days)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 18%, 82%)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(30, 8%, 48%)" />
          <YAxis tick={{ fontSize: 12 }} stroke="hsl(30, 8%, 48%)" />
          <Tooltip
            contentStyle={{
              background: "hsl(39, 32%, 96%)",
              border: "1px solid hsl(35, 18%, 82%)",
              borderRadius: "4px",
              fontSize: 13,
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Revenue"]}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="hsl(142, 28%, 28%)"
            strokeWidth={2}
            dot={{ fill: "hsl(142, 28%, 28%)", r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueChart;
