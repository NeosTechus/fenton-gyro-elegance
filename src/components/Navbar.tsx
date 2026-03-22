import { useState } from "react";
import { Phone, Menu, X } from "lucide-react";

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <a href="#" className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Fenton Gyro
        </a>

        {/* Desktop */}
        <ul className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide uppercase text-muted-foreground">
          {["Menu", "About", "Reviews", "Visit"].map((item) => (
            <li key={item}>
              <a
                href={`#${item.toLowerCase()}`}
                className="hover:text-foreground transition-colors duration-200"
              >
                {item}
              </a>
            </li>
          ))}
        </ul>

        <a
          href="tel:6366001333"
          className="hidden md:flex items-center gap-2 text-sm font-medium text-primary hover:text-accent transition-colors"
        >
          <Phone className="w-4 h-4" />
          (636) 600-1333
        </a>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-foreground active:scale-95 transition-transform"
          aria-label="Toggle menu"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-t border-border animate-fade-in">
          <ul className="flex flex-col items-center gap-4 py-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {["Menu", "About", "Reviews", "Visit"].map((item) => (
              <li key={item}>
                <a
                  href={`#${item.toLowerCase()}`}
                  onClick={() => setOpen(false)}
                  className="hover:text-foreground transition-colors"
                >
                  {item}
                </a>
              </li>
            ))}
            <li>
              <a href="tel:6366001333" className="text-primary font-medium">
                (636) 600-1333
              </a>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
