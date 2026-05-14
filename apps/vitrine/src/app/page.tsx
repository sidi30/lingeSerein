import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { TrustBar } from "@/components/trust-bar";
import { Services } from "@/components/services";
import { VisualBanner } from "@/components/visual-banner";
import { EspaceClient } from "@/components/espace-client";
import { AppShowcase } from "@/components/app-showcase";
import { Avantages } from "@/components/avantages";
import { Stats } from "@/components/stats";
import { HowItWorks } from "@/components/how-it-works";
import { Tarifs } from "@/components/tarifs";
import { Certifications } from "@/components/certifications";
import { Engagements } from "@/components/engagements";
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
        <TrustBar />
        <Services />
        <VisualBanner />
        <EspaceClient />
        <AppShowcase />
        <Avantages />
        <Stats />
        <HowItWorks />
        <Tarifs />
        <Certifications />
        <Engagements />
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
