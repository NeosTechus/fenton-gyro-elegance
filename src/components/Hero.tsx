import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-food.jpg";
import { Star, MapPin } from "lucide-react";

const Hero = () => {
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
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative min-h-[90vh] flex items-end overflow-hidden">
      <img
        src={heroImage}
        alt="Mediterranean feast at Fenton Gyro"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Gradient overlay from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/30 to-transparent" />

      <div
        ref={ref}
        className="relative z-10 max-w-6xl mx-auto w-full section-padding pb-16 md:pb-24 opacity-0"
      >
        <p className="text-sm uppercase tracking-[0.25em] text-secondary/80 font-sans font-medium mb-4">
          Mediterranean Kitchen · Fenton, MO
        </p>
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-medium text-primary-foreground leading-[0.95] mb-6 text-balance">
          Fenton Gyro
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-secondary/90 text-sm font-sans mb-8">
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

        <div className="flex flex-wrap gap-3">
          <a
            href="#menu"
            className="inline-flex items-center px-7 py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all duration-200"
          >
            View Menu
          </a>
          <a
            href="#order"
            className="inline-flex items-center px-7 py-3 border border-secondary/40 text-secondary font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:bg-secondary/10 active:scale-[0.97] transition-all duration-200"
          >
            Order Online
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
