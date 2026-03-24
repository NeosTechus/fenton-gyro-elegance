const Footer = () => (
  <footer className="py-12 section-padding border-t border-border animate-fade-in">
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
      <p className="font-serif text-lg font-medium text-foreground">Fenton Gyro</p>
      <p className="text-sm text-muted-foreground">
        © {new Date().getFullYear()} Fenton Gyro. All rights reserved.
      </p>
    </div>
  </footer>
);

export default Footer;
