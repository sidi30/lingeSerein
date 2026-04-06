import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Services } from "@/components/services";
import { VisualBanner } from "@/components/visual-banner";
import { EspaceClient } from "@/components/espace-client";
import { Avantages } from "@/components/avantages";
import { HowItWorks } from "@/components/how-it-works";
import { Engagements } from "@/components/engagements";
import { Testimonials } from "@/components/testimonials";
import { Contact } from "@/components/contact";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Services />
        <VisualBanner />
        <EspaceClient />
        <Avantages />
        <HowItWorks />
        <Engagements />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
