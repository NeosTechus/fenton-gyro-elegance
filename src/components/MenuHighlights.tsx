import { useEffect, useRef } from "react";

const items = [
  { name: "Classic Gyro", desc: "Seasoned lamb & beef, fresh veggies, tzatziki, warm pita", price: "$9.99", tag: "Signature" },
  { name: "Chicken Gyro", desc: "Grilled chicken, crisp lettuce, tomatoes, house sauce", price: "$9.99", tag: null },
  { name: "Hummus & Pita", desc: "Silky chickpea hummus drizzled with olive oil, served with two warm pitas", price: "$6.99", tag: "Popular" },
  { name: "Gyro Salad", desc: "Mixed greens, gyro meat, feta, olives, peppers, house vinaigrette", price: "$11.99", tag: null },
  { name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, and warm spices", price: "$5.49", tag: null },
  { name: "Chocolate Baklava", desc: "Flaky phyllo layers, walnuts, dark chocolate, honey syrup", price: "$4.99", tag: "Must Try" },
];

const MenuHighlights = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("animate-fade-up");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="menu" className="py-24 md:py-32 bg-card section-padding">
      <div ref={ref} className="max-w-4xl mx-auto opacity-0">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
            From Our Kitchen
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium text-balance">
            Menu Highlights
          </h2>
        </div>

        <div className="space-y-0">
          {items.map((item, i) => (
            <div
              key={item.name}
              className="flex items-baseline gap-4 py-5 border-b border-border/60 group"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-serif text-lg font-medium group-hover:text-accent transition-colors duration-200">
                    {item.name}
                  </h3>
                  {item.tag && (
                    <span className="text-[10px] uppercase tracking-wider font-sans font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-sm">
                      {item.tag}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </div>
              <span className="font-sans font-semibold text-foreground whitespace-nowrap">
                {item.price}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-sm text-muted-foreground">
            Dine-in · Curbside Pickup · Delivery
          </p>
        </div>
      </div>
    </section>
  );
};

export default MenuHighlights;
