import { useEffect, useRef } from "react";
import { Star } from "lucide-react";

const reviews = [
  {
    text: "Was in the area, so we stopped here again. This time had the Gyro Bowl, Lentil Soup, Chicken Gyro & a Chocolate Baklava — it was all fantastic. Great food and reasonable prices.",
    author: "Michael R.",
    ago: "6 months ago",
  },
  {
    text: "Best gyros in the St. Louis area, hands down. The hummus is incredibly smooth and the portions are generous. The family running it couldn't be nicer.",
    author: "Sarah T.",
    ago: "3 months ago",
  },
  {
    text: "Hidden gem in Fenton! We've been coming here weekly since we discovered it. The lentil soup is pure comfort food. Highly recommend.",
    author: "David K.",
    ago: "1 month ago",
  },
];

const Testimonials = () => {
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
    <section id="reviews" className="py-24 md:py-32 section-padding">
      <div ref={ref} className="max-w-6xl mx-auto opacity-0">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-accent font-sans font-semibold mb-4">
            What People Say
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium text-balance">
            Loved by Our Community
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {reviews.map((review, i) => (
            <div
              key={review.author}
              className="bg-card rounded-sm p-8 shadow-sm shadow-foreground/3 hover:shadow-md transition-shadow duration-300"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className="w-4 h-4 fill-gold text-gold" />
                ))}
              </div>
              <p className="text-muted-foreground leading-relaxed text-[15px] mb-6">
                "{review.text}"
              </p>
              <div className="flex items-center justify-between">
                <span className="font-sans font-semibold text-sm text-foreground">
                  {review.author}
                </span>
                <span className="text-xs text-muted-foreground">{review.ago}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
