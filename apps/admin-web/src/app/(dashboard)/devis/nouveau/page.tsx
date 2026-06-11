"use client";

import { useRouter } from "next/navigation";
import { DevisForm } from "@/components/devis/devis-form";

export default function NouveauDevisPage() {
  const router = useRouter();

  return (
    <DevisForm
      mode="create"
      onSuccess={(id) => router.push(`/devis/${id}`)}
      onCancel={() => router.push("/devis")}
    />
  );
}
