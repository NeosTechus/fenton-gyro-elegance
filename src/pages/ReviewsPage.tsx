import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Testimonials from "@/components/Testimonials";
import { useEffect } from "react";

const ReviewsPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <Testimonials />
      </main>
      <Footer />
    </>
  );
};

export default ReviewsPage;
