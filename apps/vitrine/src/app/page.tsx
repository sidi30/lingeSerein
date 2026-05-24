import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Services } from "@/components/services";
import { Avantages } from "@/components/avantages";
import { HowItWorks } from "@/components/how-it-works";
import { Tarifs } from "@/components/tarifs";
import { Testimonials } from "@/components/testimonials";
import { FAQ } from "@/components/faq";
import { Contact } from "@/components/contact";
import { Footer } from "@/components/footer";
import { StickyCTA } from "@/components/sticky-cta";
import { WhatsAppFloat } from "@/components/whatsapp-float";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Services />
        <Avantages />
        <HowItWorks />
        <Tarifs />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>
      <Footer />
      <StickyCTA />
      <WhatsAppFloat />
    </>
  );
}
