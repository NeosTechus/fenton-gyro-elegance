import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Phone, Menu, X, ShoppingBag } from "lucide-react";
import { useCart } from "@/context/CartContext";

const navItems = [
  { label: "Menu", path: "/menu" },
  { label: "About", path: "/about" },
  { label: "Reviews", path: "/reviews" },
  { label: "Visit", path: "/contact" },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { totalItems } = useCart();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Fenton Gyro
        </Link>

        {/* Desktop */}
        <ul className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide uppercase text-muted-foreground">
          {navItems.map((item) => (
            <li key={item.label}>
              <Link
                to={item.path}
                className={`hover:text-foreground transition-colors duration-200 ${
                  location.pathname === item.path ? "text-accent" : ""
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-4">
          <a
            href="tel:6366001333"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:text-accent transition-colors"
          >
            <Phone className="w-4 h-4" />
            (636) 600-1333
          </a>
          <Link
            to="/menu"
            className="relative flex items-center gap-2 px-5 py-2 bg-accent text-accent-foreground text-sm font-sans font-semibold uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            Order
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
        </div>

        <div className="md:hidden flex items-center gap-3">
          <Link
            to="/menu"
            className="relative p-2"
          >
            <ShoppingBag className="w-5 h-5 text-foreground" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-accent-foreground text-[9px] font-bold rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="text-foreground active:scale-95 transition-transform"
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-t border-border animate-fade-in">
          <ul className="flex flex-col items-center gap-4 py-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {navItems.map((item) => (
              <li key={item.label}>
                <Link
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={`hover:text-foreground transition-colors ${
                    location.pathname === item.path ? "text-accent" : ""
                  }`}
                >
                  {item.label}
                </Link>
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
