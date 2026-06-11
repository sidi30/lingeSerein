"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import type { UserDTO, UserRole, DeliveryZoneDTO } from "@/lib/types";
import { Copy, CheckCircle2, UserX, UserCheck, KeyRound } from "lucide-react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const roleConfig: Record<UserRole, { label: string; variant: BadgeVariant }> = {
  ROLE_CLIENT: { label: "Client", variant: "info" },
  ROLE_LIVREUR: { label: "Livreur", variant: "default" },
  ROLE_ADMIN: { label: "Admin", variant: "warning" },
  ROLE_SUPER_ADMIN: { label: "Super Admin", variant: "danger" },
};

const editSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  email: z.string().email("Format d'email invalide").max(320),
  phone: z.string().max(20).optional().or(z.literal("")),
  zoneId: z.string().uuid().optional().or(z.literal("")),
  role: z.enum(["CLIENT", "LIVREUR", "ADMIN"]).optional(),
});

type EditValues = z.infer<typeof editSchema>;

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";
const labelCls = "block text-xs font-medium text-gray-700 mb-1";
const errorCls = "mt-1 text-xs text-danger-600";

function PasswordModal({
  open,
  password,
  onClose,
}: {
  open: boolean;
  password: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouveau mot de passe provisoire">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-warning-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />
          <p className="text-sm text-warning-700">
            Ce mot de passe ne sera affiché qu&apos;une seule fois. Transmettez-le immédiatement à
            l&apos;utilisateur.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <code className="flex-1 font-mono text-lg font-bold tracking-widest text-gray-900">
            {password}
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
        <div className="flex justify-end">
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function UtilisateurDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);
  const [confirmResetPwd, setConfirmResetPwd] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get<UserDTO>(`/users/${id}`),
  });

  const { data: zones } = useQuery({
    queryKey: ["zones-select"],
    queryFn: () => api.get<DeliveryZoneDTO[]>("/settings/zones"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: user
      ? {
          name: user.name,
          email: user.email,
          phone: user.phone ?? "",
          zoneId: user.zoneId ?? "",
          role:
            user.role === "ROLE_CLIENT"
              ? "CLIENT"
              : user.role === "ROLE_LIVREUR"
                ? "LIVREUR"
                : user.role === "ROLE_ADMIN"
                  ? "ADMIN"
                  : undefined,
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (values: EditValues) =>
      api.patch<UserDTO>(`/users/${id}`, {
        name: values.name,
        email: values.email,
        phone: values.phone || undefined,
        zoneId: values.zoneId || undefined,
        role: values.role,
      }),
    onSuccess: () => {
      toast("Utilisateur mis à jour");
      setEditMode(false);
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la mise à jour", "error");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.patch<UserDTO>(`/users/${id}/deactivate`),
    onSuccess: () => {
      toast("Compte désactivé");
      setConfirmDeactivate(false);
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la désactivation", "error");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.patch<UserDTO>(`/users/${id}/reactivate`),
    onSuccess: () => {
      toast("Compte réactivé");
      setConfirmReactivate(false);
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors de la réactivation", "error");
    },
  });

  const resetPwdMutation = useMutation({
    mutationFn: () => api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`),
    onSuccess: (result) => {
      setConfirmResetPwd(false);
      setNewPassword(result.temporaryPassword);
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Erreur lors du reset", "error");
    },
  });

  if (isLoading) {
    return (
      <>
        <Header title="Utilisateur" />
        <div className="space-y-6 p-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header title="Utilisateur" />
        <div className="flex items-center justify-center p-12 text-gray-400">
          Utilisateur introuvable
        </div>
      </>
    );
  }

  const rc = roleConfig[user.role] ?? { label: user.role, variant: "neutral" as BadgeVariant };
  const isActive = !user.deletedAt;
  const isSuperAdmin = user.role === "ROLE_SUPER_ADMIN";

  return (
    <>
      <Header
        title={user.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {!editMode && !isSuperAdmin && (
              <Button variant="secondary" size="sm" onClick={() => setEditMode(true)}>
                Modifier
              </Button>
            )}
            {editMode && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  loading={isSubmitting || updateMutation.isPending}
                  onClick={handleSubmit((v: EditValues) => updateMutation.mutate(v))}
                >
                  Enregistrer
                </Button>
              </>
            )}
            {!isSuperAdmin && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmResetPwd(true)}>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Réinitialiser le mot de passe
              </Button>
            )}
            {isActive && !isSuperAdmin && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDeactivate(true)}>
                <UserX className="h-4 w-4" aria-hidden="true" />
                Désactiver
              </Button>
            )}
            {!isActive && (
              <Button variant="secondary" size="sm" onClick={() => setConfirmReactivate(true)}>
                <UserCheck className="h-4 w-4" aria-hidden="true" />
                Réactiver
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-6 p-6 max-w-2xl">
        {/* Statut + rôle */}
        <div className="flex flex-wrap gap-3 items-center rounded-xl border border-gray-200 bg-white p-4">
          <Badge variant={rc.variant}>{rc.label}</Badge>
          <Badge variant={isActive ? "success" : "neutral"}>{isActive ? "Actif" : "Inactif"}</Badge>
          {user.isEmailVerified && <Badge variant="success">Email vérifié</Badge>}
        </div>

        <Card title="Informations">
          {editMode ? (
            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="edit-name">
                  Nom
                </label>
                <input id="edit-name" className={inputCls} {...register("name")} />
                {errors.name && <p className={errorCls}>{errors.name.message}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-email">
                  Email
                </label>
                <input id="edit-email" type="email" className={inputCls} {...register("email")} />
                {errors.email && <p className={errorCls}>{errors.email.message}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="edit-phone">
                  Téléphone
                </label>
                <input id="edit-phone" type="tel" className={inputCls} {...register("phone")} />
              </div>
              {!isSuperAdmin && (
                <div>
                  <label className={labelCls} htmlFor="edit-role">
                    Rôle
                  </label>
                  <select id="edit-role" className={inputCls} {...register("role")}>
                    <option value="CLIENT">Client</option>
                    <option value="LIVREUR">Livreur</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="edit-zone">
                  Zone
                </label>
                <select id="edit-zone" className={inputCls} {...register("zoneId")}>
                  <option value="">Aucune zone</option>
                  {(zones ?? []).map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Téléphone</dt>
                <dd className="text-gray-700">{user.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Zone</dt>
                <dd className="text-gray-700">{user.zone?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Créé le</dt>
                <dd className="text-gray-700">{formatDate(user.createdAt)}</dd>
              </div>
              {user.deletedAt && (
                <div>
                  <dt className="text-xs text-gray-500">Désactivé le</dt>
                  <dd className="text-danger-600">{formatDate(user.deletedAt)}</dd>
                </div>
              )}
            </dl>
          )}
        </Card>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() => deactivateMutation.mutate()}
        loading={deactivateMutation.isPending}
        variant="danger"
        title="Désactiver le compte ?"
        description="L'utilisateur ne pourra plus se connecter. Ses tokens seront révoqués."
        confirmLabel="Désactiver"
      />

      <ConfirmDialog
        open={confirmReactivate}
        onClose={() => setConfirmReactivate(false)}
        onConfirm={() => reactivateMutation.mutate()}
        loading={reactivateMutation.isPending}
        title="Réactiver le compte ?"
        description="L'utilisateur pourra se reconnecter."
        confirmLabel="Réactiver"
      />

      <ConfirmDialog
        open={confirmResetPwd}
        onClose={() => setConfirmResetPwd(false)}
        onConfirm={() => resetPwdMutation.mutate()}
        loading={resetPwdMutation.isPending}
        title="Réinitialiser le mot de passe ?"
        description="Un nouveau mot de passe provisoire sera généré. Tous les tokens de l'utilisateur seront révoqués."
        confirmLabel="Réinitialiser"
      />

      <PasswordModal
        open={!!newPassword}
        password={newPassword}
        onClose={() => setNewPassword(null)}
      />
    </>
  );
}
