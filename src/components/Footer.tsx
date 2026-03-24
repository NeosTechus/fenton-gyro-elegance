import { Link } from "react-router-dom";
import { Monitor } from "lucide-react";

const Footer = () => (
  <footer className="py-12 section-padding border-t border-border animate-fade-in">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
      <p className="text-sm text-muted-foreground">
        © {new Date().getFullYear()} Fenton Gyro. All rights reserved.
      </p>
    </div>
    <div className="max-w-6xl mx-auto mt-6 flex justify-center">
      <Link
        to="/admin"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 hover:shadow-lg active:scale-[0.97] transition-all duration-200"
      >
        <Monitor className="w-4 h-4" />
        POS
      </Link>
    </div>
  </footer>
);

export default Footer;
