import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Location from "@/components/Location";
import { useEffect } from "react";
import { Navigation } from "lucide-react";

const ContactPage = () => {
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
              Visit Us
            </p>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-medium text-balance leading-[1.05] mb-6">
              Find Us in Fenton Plaza
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto mb-8">
              Stop by for dine-in, call ahead for pickup, or place an order online. We're
              conveniently located on Gravois Road with easy parking.
            </p>
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=657+Gravois+Rd,+Fenton,+MO+63026"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground text-sm font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <Navigation className="w-4 h-4" />
              Get Directions
            </a>
          </div>
        </section>

        <Location />
      </main>
      <Footer />
    </>
  );
};

export default ContactPage;
