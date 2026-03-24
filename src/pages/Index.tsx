import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import MenuHighlights from "@/components/MenuHighlights";
import Testimonials from "@/components/Testimonials";
import Location from "@/components/Location";
import Footer from "@/components/Footer";

const Index = () => (
  <>
    <Navbar />
    <div className="h-16" />
    <Hero />
    <About />
    <MenuHighlights />
    <Testimonials />
    <Location />
    <Footer />
  </>
);

export default Index;
