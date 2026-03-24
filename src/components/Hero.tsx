import { Link } from "react-router-dom";
import heroImage from "@/assets/hero-food.jpg";
import { Star, MapPin } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative min-h-[100vh] flex items-center justify-center overflow-hidden">
      {/* Background image with slow zoom */}
      <img
        src={heroImage}
        alt="Mediterranean feast at Fenton Gyro"
        className="absolute inset-0 w-full h-full object-cover scale-110 animate-[hero-zoom_20s_ease-out_forwards]"
      />

      {/* Layered overlays for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/40 to-foreground/80" />
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/30 via-transparent to-foreground/30" />

      {/* Decorative corner accents */}
      <div className="absolute top-8 left-8 w-20 h-20 border-t border-l border-gold/30 hidden md:block" />
      <div className="absolute top-8 right-8 w-20 h-20 border-t border-r border-gold/30 hidden md:block" />
      <div className="absolute bottom-8 left-8 w-20 h-20 border-b border-l border-gold/30 hidden md:block" />
      <div className="absolute bottom-8 right-8 w-20 h-20 border-b border-r border-gold/30 hidden md:block" />

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        {/* Thin decorative line */}
        <div
          className="w-16 h-px bg-gold/60 mx-auto mb-8 opacity-0 animate-fade-up"
          style={{ animationDelay: "200ms" }}
        />

        <p
          className="text-[11px] md:text-xs uppercase tracking-[0.5em] text-gold font-sans font-semibold mb-6 opacity-0 animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          Authentic Mediterranean Kitchen
        </p>

        <h1
          className="font-serif text-6xl md:text-8xl lg:text-9xl font-medium text-primary-foreground leading-[0.9] mb-4 opacity-0 animate-fade-up"
          style={{ animationDelay: "600ms" }}
        >
          Fenton Gyro
        </h1>

        <p
          className="font-serif italic text-xl md:text-2xl text-primary-foreground/70 mb-10 opacity-0 animate-fade-up"
          style={{ animationDelay: "750ms" }}
        >
          Where tradition meets every bite
        </p>

        {/* Divider */}
        <div
          className="w-24 h-px bg-gold/40 mx-auto mb-8 opacity-0 animate-fade-up"
          style={{ animationDelay: "850ms" }}
        />

        {/* Info line */}
        <div
          className="flex flex-wrap items-center justify-center gap-4 text-primary-foreground/70 text-sm font-sans mb-10 opacity-0 animate-fade-up"
          style={{ animationDelay: "950ms" }}
        >
          <span className="flex items-center gap-1.5">
            <Star className="w-4 h-4 fill-gold text-gold" />
            4.7 <span className="text-primary-foreground/50">(803 reviews)</span>
          </span>
          <span className="text-gold/40">✦</span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-gold/60" />
            Fenton, Missouri
          </span>
        </div>

        {/* CTAs */}
        <div
          className="flex flex-wrap justify-center gap-4 opacity-0 animate-fade-up"
          style={{ animationDelay: "1100ms" }}
        >
          <Link
            to="/menu"
            className="inline-flex items-center px-10 py-4 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-[0.2em] rounded-sm hover:shadow-xl hover:shadow-accent/25 active:scale-[0.97] transition-all duration-500"
          >
            Order Now
          </Link>
          <Link
            to="/menu"
            className="inline-flex items-center px-10 py-4 border border-primary-foreground/30 text-primary-foreground font-sans font-semibold text-sm uppercase tracking-[0.2em] rounded-sm hover:bg-primary-foreground/10 hover:border-primary-foreground/50 active:scale-[0.97] transition-all duration-500"
          >
            View Menu
          </Link>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
