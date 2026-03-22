import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

const menuData = [
  {
    category: "Gyros",
    items: [
      { name: "Classic Gyro", desc: "Seasoned lamb & beef, fresh veggies, tzatziki, warm pita", price: "$9.99", tag: "Signature" },
      { name: "Chicken Gyro", desc: "Grilled chicken, crisp lettuce, tomatoes, house sauce", price: "$9.99" },
      { name: "Falafel Wrap", desc: "Crispy falafel, pickled turnips, tahini, fresh herbs", price: "$8.99" },
    ],
  },
  {
    category: "Bowls",
    items: [
      { name: "Gyro Bowl", desc: "Gyro meat over seasoned rice, salad, tzatziki, pita on the side", price: "$12.99", tag: "Popular" },
      { name: "Chicken Shawarma Bowl", desc: "Marinated chicken, hummus, tabbouleh, pickles over rice", price: "$12.99" },
    ],
  },
  {
    category: "Salads",
    items: [
      { name: "Gyro Salad", desc: "Mixed greens, gyro meat, feta, olives, peppers, house vinaigrette", price: "$11.99" },
    ],
  },
  {
    category: "Sides",
    items: [
      { name: "Hummus & Pita", desc: "Silky chickpea hummus with olive oil, served with two warm pitas", price: "$6.99", tag: "Popular" },
      { name: "Lentil Soup", desc: "Slow-simmered red lentils with cumin, lemon, warm spices", price: "$5.49" },
      { name: "Seasoned Fries", desc: "Crispy fries with Mediterranean spice blend", price: "$4.49" },
    ],
  },
  {
    category: "Desserts",
    items: [
      { name: "Chocolate Baklava", desc: "Flaky phyllo, walnuts, dark chocolate, honey syrup", price: "$4.99", tag: "Must Try" },
      { name: "Rice Pudding", desc: "Creamy cinnamon-spiced rice pudding with pistachios", price: "$4.49" },
    ],
  },
];

const MenuPage = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    ref.current?.classList.add("animate-fade-up");
  }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <section className="py-24 md:py-32 section-padding">
          <div ref={ref} className="max-w-4xl mx-auto opacity-0">
            <div className="text-center mb-16">
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
                From Our Kitchen
              </p>
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-balance leading-[1.05]">
                Our Menu
              </h1>
              <p className="text-muted-foreground mt-4 max-w-md mx-auto">
                Authentic Mediterranean flavors, made fresh daily with quality ingredients.
              </p>
            </div>

            {menuData.map((section) => (
              <div key={section.category} className="mb-12">
                <h2 className="font-serif text-2xl font-medium mb-4 pb-2 border-b border-border/60">
                  {section.category}
                </h2>
                <div className="space-y-0">
                  {section.items.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-baseline gap-4 py-5 border-b border-border/30 group"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-serif text-lg font-medium group-hover:text-accent transition-colors duration-200">
                            {item.name}
                          </h3>
                          {"tag" in item && item.tag && (
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
              </div>
            ))}

            <div className="text-center mt-16">
              <Link
                to="/order"
                className="inline-flex items-center px-8 py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200"
              >
                Order Online
              </Link>
              <p className="text-sm text-muted-foreground mt-4">
                Dine-in · Curbside Pickup · Delivery
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default MenuPage;
