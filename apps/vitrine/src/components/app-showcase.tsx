import { ContainerScroll } from "./container-scroll";
import { AppDashboard } from "./app-dashboard";

export function AppShowcase() {
  return (
    <section aria-label="Application Linge Serein" className="relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lavender-200 to-transparent" />

      <ContainerScroll
        titleComponent={
          <>
            <span className="inline-block text-sm font-medium uppercase tracking-[0.25em] text-lavender-700 mb-4">
              L&apos;application Linge Serein
            </span>
            <h2 className="font-serif text-3xl md:text-5xl xl:text-6xl font-bold text-forest leading-[1.05]">
              Pilotez votre linge <br />
              <span className="text-lavender-700">depuis votre poche</span>
            </h2>
            <p className="mt-5 max-w-2xl mx-auto text-base md:text-lg text-gray-700 leading-relaxed">
              Stock en temps réel, commandes en 3 clics, suivi de livraison.
              <span className="hidden md:inline"> iOS, Android, Web — synchronisés.</span>
            </p>
          </>
        }
      >
        <AppDashboard />
      </ContainerScroll>
    </section>
  );
}
