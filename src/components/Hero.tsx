import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-food.jpg";
import { Star, MapPin } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const Hero = () => {
  const ref = useScrollReveal("animate-fade-up", 0.1);

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-end overflow-hidden">
      <img
        src={heroImage}
        alt="Mediterranean feast at Fenton Gyro"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.2s] ease-out scale-105 animate-[scale-in_1.2s_ease-out_forwards]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />

      <div
        ref={ref}
        className="relative z-10 max-w-6xl mx-auto w-full section-padding pb-16 md:pb-24 opacity-0"
      >
        <p
          className="text-sm uppercase tracking-[0.25em] text-secondary/80 font-sans font-medium mb-4 opacity-0 animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          Mediterranean Kitchen · Fenton, MO
        </p>
        <h1
          className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium text-primary-foreground leading-[0.95] mb-6 text-balance opacity-0 animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          Fenton Gyro
        </h1>

        <div
          className="flex flex-wrap items-center gap-4 text-secondary/90 text-sm font-sans mb-8 opacity-0 animate-fade-up"
          style={{ animationDelay: "600ms" }}
        >
          <span className="flex items-center gap-1.5">
            <Star className="w-4 h-4 fill-gold text-gold" />
            4.7 <span className="text-secondary/60">(803 reviews)</span>
          </span>
          <span className="text-secondary/40">·</span>
          <span>$10–20</span>
          <span className="text-secondary/40">·</span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            657 Gravois Rd
          </span>
        </div>

        <div
          className="flex flex-wrap gap-3 opacity-0 animate-fade-up"
          style={{ animationDelay: "800ms" }}
        >
          <Link
            to="/menu"
            className="inline-flex items-center px-7 py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 hover:shadow-lg hover:shadow-accent/20 active:scale-[0.97] transition-all duration-300"
          >
            Order Now
          </Link>
          <Link
            to="/menu"
            className="inline-flex items-center px-7 py-3 border border-secondary/40 text-secondary font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:bg-secondary/10 hover:border-secondary/60 active:scale-[0.97] transition-all duration-300"
          >
            View Menu
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
