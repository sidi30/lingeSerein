"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/lib/toast";
import type { UserDTO, DeliveryZoneDTO } from "@/lib/types";
import { Copy, CheckCircle2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  email: z.string().email("Format d'email invalide").max(320),
  role: z.enum(["CLIENT", "LIVREUR", "ADMIN"], {
    errorMap: () => ({ message: "Rôle invalide. Valeurs acceptées : CLIENT, LIVREUR, ADMIN" }),
  }),
  phone: z.string().max(20).optional().or(z.literal("")),
  zoneId: z.string().uuid("ID invalide").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

export default function NouvelUtilisateurPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: zones } = useQuery({
    queryKey: ["zones-select"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", role: "CLIENT", phone: "", zoneId: "" },
  });

  const selectedRole = watch("role");

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post<{ user: UserDTO; temporaryPassword: string }>("/users", {
        name: values.name,
        email: values.email,
        role: values.role,
        phone: values.phone || undefined,
        zoneId: values.zoneId || undefined,
      }),
    onSuccess: (result) => {
      setTempPassword(result.temporaryPassword);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur lors de la création";
      toast(msg, "error");
    },
  });

  const handleCopy = async () => {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  return (
    <>
      <Header
        title="Nouvel utilisateur"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push("/utilisateurs")}>
              Annuler
            </Button>
            <Button
              size="sm"
              loading={isSubmitting || mutation.isPending}
              onClick={handleSubmit(onSubmit)}
            >
              Créer le compte
            </Button>
          </div>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 p-6 max-w-2xl">
        <Card title="Informations du compte">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="name">
                Nom complet <span className="text-danger-600">*</span>
              </label>
              <input
                id="name"
                className={inputCls}
                placeholder="Marie-Claire Dupont"
                {...register("name")}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {errors.name && (
                <p id="name-error" className={errorCls}>
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="email">
                Email <span className="text-danger-600">*</span>
              </label>
              <input
                id="email"
                type="email"
                className={inputCls}
                placeholder="contact@email.fr"
                {...register("email")}
                aria-describedby={errors.email ? "email-error" : undefined}
              />
              {errors.email && (
                <p id="email-error" className={errorCls}>
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="phone">
                Téléphone
              </label>
              <input
                id="phone"
                type="tel"
                className={inputCls}
                placeholder="06 12 34 56 78"
                {...register("phone")}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="role">
                Rôle <span className="text-danger-600">*</span>
              </label>
              <select
                id="role"
                className={inputCls}
                {...register("role")}
                aria-describedby={errors.role ? "role-error" : undefined}
              >
                <option value="CLIENT">Client</option>
                <option value="LIVREUR">Livreur</option>
                <option value="ADMIN">Admin</option>
              </select>
              {errors.role && (
                <p id="role-error" className={errorCls}>
                  {errors.role.message}
                </p>
              )}
            </div>

            {(selectedRole === "LIVREUR" || selectedRole === "CLIENT") && (
              <div>
                <label className={labelCls} htmlFor="zoneId">
                  Zone de livraison
                </label>
                <select id="zoneId" className={inputCls} {...register("zoneId")}>
                  <option value="">Aucune zone</option>
                  {(zones ?? []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </Card>

        <p className="rounded-lg bg-primary-50 p-4 text-sm text-primary-700">
          Un mot de passe provisoire de 12 caractères sera généré automatiquement et affiché une
          seule fois après la création.
        </p>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => router.push("/utilisateurs")}>
            Annuler
          </Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Créer le compte
          </Button>
        </div>
      </form>

      {/* Modal mot de passe provisoire */}
      <Modal
        open={!!tempPassword}
        onClose={() => {
          setTempPassword(null);
          router.push("/utilisateurs");
        }}
        title="Compte créé"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-success-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-success-800">Compte créé avec succès</p>
              <p className="mt-1 text-sm text-success-700">
                Transmettez ce mot de passe provisoire à l&apos;utilisateur. Il ne sera affiché
                qu&apos;une seule fois.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
              Mot de passe provisoire
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
              <code className="flex-1 font-mono text-lg font-bold tracking-widest text-gray-900">
                {tempPassword}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                aria-label="Copier le mot de passe"
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copié" : "Copier"}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Ce mot de passe n&apos;est jamais stocké en clair. Après fermeture de cette fenêtre, il
            ne sera plus récupérable.
          </p>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                setTempPassword(null);
                router.push("/utilisateurs");
              }}
            >
              Terminer
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
