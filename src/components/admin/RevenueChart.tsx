import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Order } from "@/data/orders";

export type RevenueRange = "daily" | "weekly" | "monthly" | "yearly";

interface RevenueChartProps {
  orders: Order[];
  range: RevenueRange;
  customRange?: { from: Date; to: Date };
}

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const buildCustomBuckets = (from: Date, to: Date) => {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;

  if (days <= 1) {
    // Hourly buckets for single day
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(start);
      s.setHours(i * 2, 0, 0, 0);
      const e = new Date(s);
      e.setHours(e.getHours() + 2);
      return { start: s, end: e, label: `${i * 2}h` };
    });
  }

  if (days <= 31) {
    // Daily buckets
    return Array.from({ length: days }, (_, i) => {
      const s = new Date(start);
      s.setDate(s.getDate() + i);
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      return {
        start: s,
        end: e,
        label: s.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }

  // Monthly buckets
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor.getTime() <= last.getTime()) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    buckets.push({
      start: new Date(cursor),
      end: next,
      label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
    cursor = next;
  }
  return buckets;
};

const buildBuckets = (range: RevenueRange, customRange?: { from: Date; to: Date }) => {
  if (customRange) return buildCustomBuckets(customRange.from, customRange.to);
  const now = new Date();
  switch (range) {
    case "daily": {
      const dayStart = startOfDay(now);
      return Array.from({ length: 12 }, (_, i) => {
        const start = new Date(dayStart);
        start.setHours(i * 2, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 2);
        return { start, end, label: `${i * 2}h` };
      });
    }
    case "weekly": {
      // This week: Sunday → today
      const weekStart = startOfDay(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const daysSoFar = now.getDay() + 1;
      return Array.from({ length: daysSoFar }, (_, i) => {
        const start = new Date(weekStart);
        start.setDate(weekStart.getDate() + i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return {
          start,
          end,
          label: start.toLocaleDateString("en-US", { weekday: "short" }),
        };
      });
    }
    case "monthly": {
      // Days of current month, up to today
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const daysSoFar = now.getDate();
      return Array.from({ length: daysSoFar }, (_, i) => {
        const start = new Date(monthStart);
        start.setDate(monthStart.getDate() + i);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end, label: String(start.getDate()) };
      });
    }
    case "yearly": {
      // Months of current year, up to current month
      const monthsSoFar = now.getMonth() + 1;
      return Array.from({ length: monthsSoFar }, (_, i) => {
        const start = new Date(now.getFullYear(), i, 1);
        const end = new Date(now.getFullYear(), i + 1, 1);
        return {
          start,
          end,
          label: start.toLocaleDateString("en-US", { month: "short" }),
        };
      });
    }
  }
};

const titleByRange: Record<RevenueRange, string> = {
  daily: "Revenue (Today)",
  weekly: "Revenue (This Week)",
  monthly: "Revenue (This Month)",
  yearly: "Revenue (This Year)",
};

const RevenueChart = ({ orders, range, customRange }: RevenueChartProps) => {
  const data = useMemo(() => {
    const buckets = buildBuckets(range, customRange);
    return buckets.map((b) => {
      const revenue = orders.reduce((sum, o) => {
        const t = new Date(o.created_at).getTime();
        if (t >= b.start.getTime() && t < b.end.getTime()) return sum + o.total;
        return sum;
      }, 0);
      return { name: b.label, revenue: Math.round(revenue * 100) / 100 };
    });
  }, [orders, range, customRange]);

  const title = (() => {
    if (!customRange) return titleByRange[range];
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return customRange.from.getTime() === customRange.to.getTime()
      ? `Revenue (${fmt(customRange.from)})`
      : `Revenue (${fmt(customRange.from)} – ${fmt(customRange.to)})`;
  })();

  return (
    <div className="bg-card border border-border rounded-sm p-6">
      <h3 className="font-serif text-lg font-medium mb-6">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 18%, 82%)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(30, 8%, 48%)" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="hsl(30, 8%, 48%)"
            tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          />
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
          >
            <LabelList
              dataKey="revenue"
              position="top"
              offset={10}
              style={{ fontSize: 11, fill: "hsl(142, 28%, 28%)", fontWeight: 500 }}
              formatter={(value: number) =>
                value > 0
                  ? value >= 1000
                    ? `$${(value / 1000).toFixed(1)}k`
                    : `$${value.toFixed(0)}`
                  : ""
              }
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueChart;
