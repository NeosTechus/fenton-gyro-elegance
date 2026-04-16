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

interface ItemSalesChartProps {
  orders: Order[];
}

const ItemSalesChart = ({ orders }: ItemSalesChartProps) => {
  // Count how many times each item was sold
  const itemCounts: Record<string, { name: string; qty: number; revenue: number }> = {};

  orders.forEach((order) => {
    if (order.status === "cancelled") return;
    order.items.forEach((item) => {
      if (!itemCounts[item.name]) {
        itemCounts[item.name] = { name: item.name, qty: 0, revenue: 0 };
      }
      itemCounts[item.name].qty += item.quantity;
      itemCounts[item.name].revenue += item.price * item.quantity;
    });
  });

  // Sort by quantity sold, top 15
  const sorted = Object.values(itemCounts)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 15);

  const totalItemsSold = sorted.reduce((s, i) => s + i.qty, 0);
  const totalItemRevenue = sorted.reduce((s, i) => s + i.revenue, 0);

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-serif text-lg font-medium">Top Selling Items</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {totalItemsSold} items sold — ${totalItemRevenue.toFixed(2)} revenue
          </p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No item data yet</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sorted} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 18%, 82%)" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(30, 8%, 48%)" allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(30, 8%, 48%)" width={100} />
              <Tooltip
                contentStyle={{
                  background: "hsl(39, 32%, 96%)",
                  border: "1px solid hsl(35, 18%, 82%)",
                  borderRadius: "4px",
                  fontSize: 13,
                }}
                formatter={(value: number, name: string) => {
                  if (name === "qty") return [`${value} sold`, "Quantity"];
                  return [`$${value.toFixed(2)}`, "Revenue"];
                }}
              />
              <Bar dataKey="qty" fill="hsl(142, 28%, 28%)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Item breakdown table */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="grid grid-cols-4 text-[10px] uppercase tracking-wider font-sans font-semibold text-muted-foreground mb-2 px-2">
              <span className="col-span-2">Item</span>
              <span className="text-right">Qty Sold</span>
              <span className="text-right">Revenue</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {sorted.map((item, i) => (
                <div key={item.name} className="grid grid-cols-4 text-sm px-2 py-1.5 rounded-sm hover:bg-muted/50">
                  <span className="col-span-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <span className="font-medium truncate">{item.name}</span>
                  </span>
                  <span className="text-right font-semibold">{item.qty}</span>
                  <span className="text-right font-semibold text-accent">${item.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ItemSalesChart;
