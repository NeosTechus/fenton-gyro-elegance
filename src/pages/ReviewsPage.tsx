import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Testimonials from "@/components/Testimonials";
import { useEffect } from "react";
import { Star } from "lucide-react";

const ReviewsPage = () => {
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
              Reviews
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-balance leading-[1.05] mb-6">
              What Our Guests Say
            </h1>
            <div className="flex items-center justify-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-gold text-gold" />
              ))}
            </div>
            <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Don't just take our word for it — hear from the community that's made Fenton Gyro
              a local favorite.
            </p>
          </div>
        </section>

        <Testimonials />

        {/* CTA to leave a review */}
        <section className="py-16 md:py-24 section-padding">
          <div className="max-w-2xl mx-auto text-center animate-fade-up">
            <h2 className="font-serif text-2xl md:text-3xl font-medium mb-4">
              Enjoyed Your Visit?
            </h2>
            <p className="text-muted-foreground mb-8">
              We'd love to hear from you! Leave us a review on Google and help others discover
              Fenton Gyro.
            </p>
            <a
              href="https://www.google.com/maps/place/657+Gravois+Rd,+Fenton,+MO+63026"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground text-sm font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <Star className="w-4 h-4" />
              Leave a Review
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
};

export default ReviewsPage;
