import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import About from "@/components/About";
import { useEffect } from "react";
import { UtensilsCrossed, Heart, Leaf } from "lucide-react";

const values = [
  {
    icon: UtensilsCrossed,
    title: "Family Recipes",
    description:
      "Every dish is prepared using recipes passed down through generations, bringing the authentic taste of the Mediterranean to your plate.",
  },
  {
    icon: Leaf,
    title: "Fresh Ingredients",
    description:
      "We source the freshest produce and highest-quality meats daily, because great food starts with great ingredients.",
  },
  {
    icon: Heart,
    title: "Made with Love",
    description:
      "From our kitchen to your table, every order is crafted with care and a genuine passion for hospitality.",
  },
];

const AboutPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        {/* Page hero */}
        <section className="py-16 md:py-24 section-padding bg-muted/40">
          <div className="max-w-3xl mx-auto text-center animate-fade-up">
            <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
              About Us
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-balance leading-[1.05] mb-6">
              The Heart Behind Every Plate
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Fenton Gyro isn't just a restaurant — it's a family tradition. Learn about the
              people, the passion, and the flavors that make us who we are.
            </p>
          </div>
        </section>

        <About />

        {/* Our Values */}
        <section className="py-24 md:py-32 section-padding">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16 animate-fade-up">
              <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
                What We Stand For
              </p>
              <h2 className="font-serif text-3xl md:text-4xl font-medium text-balance">
                Our Values
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {values.map((v, i) => (
                <div
                  key={v.title}
                  className="text-center p-8 rounded-sm bg-card shadow-sm shadow-foreground/3 animate-fade-up"
                  style={{ animationDelay: `${150 + i * 100}ms` }}
                >
                  <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-accent/10 flex items-center justify-center">
                    <v.icon className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="font-serif text-xl font-medium mb-3">{v.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {v.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default AboutPage;
