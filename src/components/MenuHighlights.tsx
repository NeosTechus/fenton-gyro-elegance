import { Link } from "react-router-dom";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const items = [
  { name: "Traditional Gyro", desc: "Gyro slices, lettuce, tomatoes, red onions, feta cheese crumbles & housemade tzatziki sauce on pita bread", price: "$10.99", tag: "Signature" },
  { name: "Chicken Gyro", desc: "Grilled chicken, feta cheese crumbles, lettuce, tomatoes, red onions & housemade tzatziki sauce", price: "$10.99", tag: "Popular" },
  { name: "Hummus Plate", desc: "Roasted garlic hummus served with 2 sliced pitas", price: "$6.99", tag: "Popular" },
  { name: "Gyro Salad", desc: "Your choice of Gyro slices or grilled chicken, mixed lettuce, feta, onions, tomatoes, cucumbers, olives, green peppers & tzatziki sauce", price: "$12.99", tag: null },
  { name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, and warm spices", price: "$3.49", tag: null },
  { name: "Greek Baklava", desc: "Thin layers of phyllo dough, topped with walnuts & pecans, and drizzled with pure honey", price: "$3.49", tag: "Must Try" },
];

const MenuHighlights = () => {
  const headerRef = useScrollReveal("animate-fade-up", 0.15);
  const listRef = useScrollReveal("animate-fade-up", 0.1);

  return (
    <section id="menu" className="py-24 md:py-32 bg-card section-padding">
      <div className="max-w-4xl mx-auto">
        <div ref={headerRef} className="text-center mb-16 opacity-0">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
            From Our Kitchen
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium text-balance">
            Menu Highlights
          </h2>
        </div>

        <div ref={listRef} className="space-y-0 opacity-0">
          {items.map((item, i) => (
            <div
              key={item.name}
              className="flex items-baseline gap-4 py-5 border-b border-border/60 group opacity-0 animate-fade-up hover:bg-muted/30 px-3 -mx-3 rounded-sm transition-colors duration-200"
              style={{ animationDelay: `${200 + i * 100}ms` }}
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
              <span className="font-sans font-semibold text-foreground whitespace-nowrap group-hover:text-accent transition-colors duration-200">
                {item.price}
              </span>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 opacity-0 animate-fade-up" style={{ animationDelay: "900ms" }}>
          <Link
            to="/menu"
            className="inline-flex items-center px-8 py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 hover:shadow-lg hover:shadow-accent/20 active:scale-[0.97] transition-all duration-300"
          >
            View Full Menu & Order
          </Link>
          <p className="text-sm text-muted-foreground mt-4">
            Curbside Pickup Available
          </p>
        </div>
      </div>
    </section>
  );
};

export default MenuHighlights;
