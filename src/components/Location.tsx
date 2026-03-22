import { useEffect, useRef } from "react";
import { MapPin, Clock, Phone } from "lucide-react";

const Location = () => {
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
    <section id="visit" className="py-24 md:py-32 bg-primary text-primary-foreground section-padding">
      <div ref={ref} className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 md:gap-16 opacity-0">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-primary-foreground/60 font-sans font-semibold mb-4">
            Come Visit
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-medium leading-[1.1] mb-10 text-balance">
            We'd Love to See You
          </h2>

          <div className="space-y-8">
            <div className="flex gap-4">
              <MapPin className="w-5 h-5 mt-0.5 text-primary-foreground/60 shrink-0" />
              <div>
                <p className="font-sans font-semibold mb-1">Location</p>
                <p className="text-primary-foreground/70 text-sm leading-relaxed">
                  657 Gravois Rd<br />
                  Fenton, MO 63026<br />
                  Located in Fenton Plaza
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Clock className="w-5 h-5 mt-0.5 text-primary-foreground/60 shrink-0" />
              <div>
                <p className="font-sans font-semibold mb-1">Hours</p>
                <div className="text-primary-foreground/70 text-sm leading-relaxed space-y-0.5">
                  <p>Monday – Saturday: 11 AM – 9 PM</p>
                  <p>Sunday: Closed</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Phone className="w-5 h-5 mt-0.5 text-primary-foreground/60 shrink-0" />
              <div>
                <p className="font-sans font-semibold mb-1">Phone</p>
                <a
                  href="tel:6366001333"
                  className="text-primary-foreground/70 text-sm hover:text-primary-foreground transition-colors"
                >
                  (636) 600-1333
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-sm overflow-hidden shadow-lg">
          <iframe
            title="Fenton Gyro location"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3120.5!2d-90.4536!3d38.5127!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x87d8cde8a2a0a5a3%3A0x8a9b9b9b9b9b9b9b!2s657+Gravois+Rd%2C+Fenton%2C+MO+63026!5e0!3m2!1sen!2sus!4v1"
            width="100%"
            height="100%"
            className="w-full aspect-square md:aspect-auto md:h-full min-h-[320px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
};

export default Location;
