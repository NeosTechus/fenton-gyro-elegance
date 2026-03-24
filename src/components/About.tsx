import { useScrollReveal } from "@/hooks/useScrollReveal";
import interiorImage from "@/assets/interior.jpg";

const About = () => {
  const textRef = useScrollReveal("animate-slide-left", 0.2);
  const imageRef = useScrollReveal("animate-slide-right", 0.2);

  return (
    <section id="about" className="py-24 md:py-32 section-padding">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 items-center">
        <div ref={textRef} className="order-2 md:order-1 opacity-0">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
            Our Story
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium leading-[1.1] mb-6 text-balance">
            Authentic Flavors, Warm Hospitality
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6 max-w-lg">
            Nestled in Fenton Plaza, Fenton Gyro brings the vibrant tastes of the Mediterranean to 
            the heart of Missouri. Every dish is crafted with time-honored recipes, fresh ingredients, 
            and a dedication to making you feel at home.
          </p>
          <p className="text-muted-foreground leading-relaxed max-w-lg">
            From our signature gyros and creamy hummus to our beloved chocolate baklava, each plate 
            tells a story of tradition passed down through generations. Come for the food — stay 
            for the warmth.
          </p>
        </div>

        <div ref={imageRef} className="order-1 md:order-2 relative opacity-0">
          <div className="overflow-hidden rounded-sm shadow-xl shadow-foreground/5">
            <img
              src={interiorImage}
              alt="Warm interior of Fenton Gyro restaurant"
              className="w-full aspect-[4/3] object-cover hover:scale-105 transition-transform duration-700"
              loading="lazy"
            />
          </div>
          <div className="absolute -bottom-4 -left-4 w-24 h-24 border-2 border-accent/30 rounded-sm -z-10" />
        </div>
      </div>
    </section>
  );
};

export default About;
