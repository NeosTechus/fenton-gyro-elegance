import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";
import { Order, OrderStatus } from "@/data/orders";

interface OrderStatusChartProps {
  orders: Order[];
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#d4a017",
  received: "#c0392b",
  preparing: "#e67e22",
  ready: "#27ae60",
  completed: "#2c6e49",
  cancelled: "#7f8c8d",
};

const OrderStatusChart = ({ orders }: OrderStatusChartProps) => {
  const statusCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const data = Object.entries(statusCounts).map(([status, count]) => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    value: count,
    color: STATUS_COLORS[status as OrderStatus] || "#999",
  }));

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <h3 className="font-serif text-lg font-medium mb-4">Order Status</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Legend
            verticalAlign="bottom"
            iconSize={8}
            formatter={(value) => (
              <span style={{ fontSize: 11, color: "hsl(30, 8%, 48%)" }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default OrderStatusChart;
