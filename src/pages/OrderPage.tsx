import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import OnlineOrder from "@/components/OnlineOrder";
import { useEffect } from "react";

const OrderPage = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20">
        <OnlineOrder />
      </main>
      <Footer />
    </>
  );
};

export default OrderPage;
