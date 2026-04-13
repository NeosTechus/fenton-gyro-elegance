import { useEffect, useRef } from "react";
import { Check, ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

const OrderSuccess = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId") || searchParams.get("session_id");

  useEffect(() => {
    ref.current?.classList.add("animate-fade-up");
  }, []);

  return (
    <section className="min-h-screen flex items-center justify-center bg-card section-padding">
      <div ref={ref} className="max-w-lg mx-auto text-center opacity-0">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-8 animate-scale-in opacity-0" style={{ animationDelay: "300ms" }}>
          <Check className="w-10 h-10 text-primary" />
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-medium mb-4 opacity-0 animate-fade-up" style={{ animationDelay: "500ms" }}>
          Payment Successful!
        </h1>
        <p className="text-muted-foreground leading-relaxed mb-2 opacity-0 animate-fade-up" style={{ animationDelay: "650ms" }}>
          Your order has been placed and payment confirmed. We're preparing your food now.
        </p>
        <p className="text-muted-foreground text-sm mb-8 opacity-0 animate-fade-up" style={{ animationDelay: "750ms" }}>
          We'll call you shortly to confirm the details.
        </p>
        {orderId && (
          <p className="text-xs text-muted-foreground/60 mb-6 font-mono opacity-0 animate-fade-up" style={{ animationDelay: "850ms" }}>
            Order: {orderId.slice(-8).toUpperCase()}
          </p>
        )}
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 hover:shadow-lg active:scale-[0.97] transition-all duration-300 opacity-0 animate-fade-up"
          style={{ animationDelay: "950ms" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </section>
  );
};

export default OrderSuccess;
