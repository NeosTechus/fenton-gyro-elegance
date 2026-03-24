import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-food.jpg";
import { Star, MapPin, ChevronDown } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
    {Array.from({ length: 12 }).map((_, i) => (
      <span
        key={i}
        className="absolute rounded-full bg-gold/30"
        style={{
          width: `${Math.random() * 4 + 2}px`,
          height: `${Math.random() * 4 + 2}px`,
          left: `${Math.random() * 100}%`,
          bottom: `-5%`,
          animation: `float-up ${Math.random() * 8 + 10}s linear infinite`,
          animationDelay: `${Math.random() * 10}s`,
        }}
      />
    ))}
  </div>
);

const Hero = () => {
  const ref = useScrollReveal("animate-fade-up", 0.1);

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden">
      {/* Background with Ken Burns */}
      <img
        src={heroImage}
        alt="Mediterranean feast at Fenton Gyro"
        className="absolute inset-0 w-full h-full object-cover animate-ken-burns"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-foreground/10" />

      <FloatingParticles />

      <div
        ref={ref}
        className="relative z-10 max-w-6xl mx-auto w-full section-padding py-16 md:py-24 opacity-0 text-center flex flex-col items-center"
      >
        {/* Subtitle */}
        <p
          className="text-xs md:text-sm uppercase tracking-[0.3em] text-secondary/80 font-sans font-medium mb-6 opacity-0 animate-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          ✦&nbsp; Mediterranean Kitchen · Fenton, MO &nbsp;✦
        </p>

        {/* Main Title with shimmer */}
        <h1
          className="font-serif text-6xl md:text-8xl lg:text-9xl font-medium leading-[0.95] mb-3 text-balance opacity-0 animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          <span className="animate-text-shimmer inline-block">Fenton Gyro</span>
        </h1>

        {/* Decorative line */}
        <div
          className="w-20 h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent mb-5 opacity-0 animate-fade-up"
          style={{ animationDelay: "500ms" }}
        />

        {/* Tagline */}
        <p
          className="text-lg md:text-xl text-secondary/70 font-sans mb-8 opacity-0 animate-fade-up max-w-xl font-light italic"
          style={{ animationDelay: "550ms" }}
        >
          Authentic Mediterranean flavors, made fresh daily
        </p>

        {/* Info badges */}
        <div
          className="flex flex-wrap items-center justify-center gap-4 text-secondary/90 text-sm font-sans mb-10 opacity-0 animate-fade-up"
          style={{ animationDelay: "650ms" }}
        >
          <span className="flex items-center gap-1.5 bg-foreground/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
            <Star className="w-4 h-4 fill-gold text-gold" />
            4.7 <span className="text-secondary/60">(803 reviews)</span>
          </span>
          <span className="flex items-center gap-1.5 bg-foreground/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
            $10–20
          </span>
          <span className="flex items-center gap-1 bg-foreground/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
            <MapPin className="w-3.5 h-3.5" />
            657 Gravois Rd
          </span>
        </div>

        {/* CTA Buttons with glow */}
        <div
          className="flex flex-wrap justify-center gap-4 opacity-0 animate-fade-up"
          style={{ animationDelay: "800ms" }}
        >
          <Link
            to="/menu"
            className="inline-flex items-center px-8 py-3.5 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm animate-glow-pulse hover:scale-105 active:scale-[0.97] transition-transform duration-300"
          >
            Order Now
          </Link>
          <Link
            to="/menu"
            className="inline-flex items-center px-8 py-3.5 border border-secondary/40 text-secondary font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:bg-secondary/10 hover:border-secondary/60 hover:scale-105 active:scale-[0.97] transition-all duration-300 backdrop-blur-sm"
          >
            View Menu
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 opacity-0 animate-fade-up" style={{ animationDelay: "1200ms" }}>
        <ChevronDown className="w-6 h-6 text-secondary/50 animate-bounce-slow" />
      </div>
    </section>
  );
};

export default Hero;
