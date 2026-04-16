import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <>
      <Navbar />
      <main className="pt-20 min-h-screen bg-background section-padding">
        <div className="max-w-3xl mx-auto py-12">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>

          <h1 className="font-serif text-3xl md:text-4xl font-medium mb-8">Privacy Policy</h1>

          <div className="prose prose-sm text-muted-foreground space-y-6">
            <p className="text-sm">Last updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Information We Collect</h2>
              <p>When you place an order through our website, kiosk, or point-of-sale system, we may collect:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Name, phone number, and email address</li>
                <li>Order details and preferences</li>
                <li>Payment information (processed securely by our payment processor, Valor PayTech)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">How We Use Your Information</h2>
              <ul className="list-disc pl-5 space-y-1">
                <li>To process and fulfill your orders</li>
                <li>To notify you about your order status</li>
                <li>To improve our menu and services</li>
                <li>To communicate with you about your orders</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Payment Security</h2>
              <p>We do not store your credit card information. All payments are processed securely through Valor PayTech's PCI-compliant payment platform. Your card details are entered directly on Valor's secure hosted payment page.</p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Data Storage</h2>
              <p>Your order information is stored securely using Google Firebase services. We retain order data for business operations and to provide you with order history and tracking.</p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Third-Party Services</h2>
              <p>We use the following third-party services:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><strong>Google Firebase</strong> — Authentication and data storage</li>
                <li><strong>Valor PayTech / Fiserv</strong> — Payment processing</li>
                <li><strong>Vercel</strong> — Website hosting</li>
              </ul>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Your Rights</h2>
              <p>You may request to view, update, or delete your personal information by contacting us. We will respond to your request within a reasonable timeframe.</p>
            </section>

            <section>
              <h2 className="font-serif text-xl font-medium text-foreground mb-2">Contact Us</h2>
              <p>If you have questions about this privacy policy, please contact us:</p>
              <ul className="list-none space-y-1 mt-2">
                <li><strong>Fenton Gyro LLC</strong></li>
                <li>657 Gravois Rd, Fenton, MO 63026</li>
                <li>Phone: <a href="tel:6366001333" className="text-accent hover:underline">(636) 600-1333</a></li>
                <li>Email: <a href="mailto:gyrogyrollc@outlook.com" className="text-accent hover:underline">gyrogyrollc@outlook.com</a></li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default PrivacyPolicy;
