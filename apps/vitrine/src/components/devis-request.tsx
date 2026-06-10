"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Check, Send } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_MAILER_URL || "https://api.lingeserein.fr";

const inputCls =
  "w-full rounded-lg border border-lavender-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest";

interface Props {
  /** Récapitulatif chiffré (déjà formaté) envoyé au propriétaire. */
  recap: string;
}

/**
 * Envoie au propriétaire l'estimation que le visiteur a montée dans le simulateur,
 * via le mailer existant (/api/contact). Le proprio reçoit le détail chiffré + contact.
 */
export function DevisRequest({ recap }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus("sending");
    setError("");

    const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement)?.value ?? "";
    const note = get("note").trim();
    const message =
      `Demande de devis depuis le simulateur :\n\n${recap}` +
      (note ? `\n\nMessage du client :\n${note}` : "");

    const payload = {
      name: get("name"),
      company: get("company"),
      email: get("email"),
      phone: get("phone"),
      message: message.slice(0, 2000),
      website: get("website"), // honeypot
    };

    try {
      const res = await fetch(`${API_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || "Envoi impossible. Réessayez ou appelez-nous.");
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-2xl bg-forest/5 border border-forest/20 p-5 text-center">
        <Check size={28} aria-hidden className="mx-auto text-forest mb-2" />
        <p className="text-sm font-semibold text-forest">Demande envoyée !</p>
        <p className="text-xs text-gray-700 mt-1">
          Vous recevrez votre devis personnalisé sous 24 h. Un email de confirmation vous a été
          envoyé.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center justify-center gap-2 rounded-full bg-forest w-full py-3.5 text-sm font-medium text-white shadow-lg shadow-forest/20 transition-colors hover:bg-forest-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        Recevoir mon devis officiel
        <ArrowRight
          size={15}
          aria-hidden
          className="transition-transform group-hover:translate-x-1"
        />
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl bg-white border border-lavender-200 shadow-sm p-5 space-y-3"
    >
      <p className="text-sm font-bold text-forest">Recevoir ce devis par email</p>
      <p className="text-[11px] text-gray-500 -mt-1">
        Votre estimation ci-contre est jointe automatiquement à la demande.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          name="company"
          required
          minLength={2}
          placeholder="Établissement *"
          className={inputCls}
        />
        <input name="name" required minLength={2} placeholder="Votre nom *" className={inputCls} />
        <input
          name="email"
          type="email"
          required
          placeholder="Email *"
          autoComplete="email"
          className={inputCls}
        />
        <input
          name="phone"
          type="tel"
          required
          minLength={8}
          placeholder="Téléphone *"
          autoComplete="tel"
          className={inputCls}
        />
      </div>
      <textarea
        name="note"
        rows={2}
        placeholder="Message (optionnel) : fréquence souhaitée, questions…"
        className={inputCls}
      />
      {/* Honeypot anti-bot — masqué */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />

      {status === "error" && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest py-3 text-sm font-medium text-white transition-colors hover:bg-forest-light disabled:opacity-50"
      >
        {status === "sending" ? (
          <>
            <Loader2 size={15} aria-hidden className="animate-spin" /> Envoi…
          </>
        ) : (
          <>
            <Send size={15} aria-hidden /> Envoyer ma demande
          </>
        )}
      </button>
    </form>
  );
}
