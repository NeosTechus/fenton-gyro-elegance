import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="py-8 section-padding border-t border-border animate-fade-in">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
      <div className="flex items-center gap-4">
        <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <span className="text-muted-foreground/30">|</span>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Fenton Gyro. All rights reserved.
        </p>
        <span className="text-muted-foreground/30">|</span>
        <a
          href="https://neostechus.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <img src="/neostechus-logo.png" alt="NeosTech LLC" className="h-4 w-auto" />
          Powered by NeosTech LLC
        </a>
      </div>
    </div>
  </footer>
);

export default Footer;
