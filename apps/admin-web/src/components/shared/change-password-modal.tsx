"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Politique mot de passe identique au backend (users.schema.ts) :
 * min 8, max 72, une majuscule, une minuscule, un chiffre, un caractère spécial.
 */
const passwordPolicySchema = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(72, "Le mot de passe ne doit pas dépasser 72 caractères")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/,
    "Le mot de passe doit contenir une majuscule, une minuscule, un chiffre et un caractère spécial",
  );

const schema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
    newPassword: passwordPolicySchema,
    confirmPassword: z.string().min(1, "Veuillez confirmer le nouveau mot de passe"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

interface PasswordStrengthProps {
  value: string;
}

function PasswordStrength({ value }: PasswordStrengthProps) {
  if (!value) return null;
  const checks = [
    { label: "8 caractères min.", ok: value.length >= 8 },
    { label: "Majuscule", ok: /[A-Z]/.test(value) },
    { label: "Minuscule", ok: /[a-z]/.test(value) },
    { label: "Chiffre", ok: /\d/.test(value) },
    { label: "Caractère spécial", ok: /[^a-zA-Z0-9]/.test(value) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColor = score <= 2 ? "bg-danger-500" : score <= 3 ? "bg-warning-500" : "bg-success-500";

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {checks.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? barColor : "bg-gray-200"}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span
            key={c.label}
            className={`text-[10px] ${c.ok ? "text-success-600" : "text-gray-400"}`}
          >
            {c.ok ? "+" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  error?: string;
  registration: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]>;
}

function PasswordField({ id, label, error, registration }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
            error
              ? "border-danger-500 focus:border-danger-500 focus:ring-danger-500"
              : "border-gray-300 focus:border-primary-500 focus:ring-primary-500"
          }`}
          {...registration}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

function changePasswordErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code = (err as ApiError & { code?: string }).code;
    if (code === "INVALID_CURRENT_PASSWORD" || err.status === 401) {
      return "Le mot de passe actuel est incorrect.";
    }
    if (code === "SAME_PASSWORD") {
      return "Le nouveau mot de passe doit être différent de l'ancien.";
    }
  }
  return err instanceof Error ? err.message : "Erreur lors du changement de mot de passe.";
}

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
  });

  const newPasswordValue = watch("newPassword") ?? "";

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.patch<{ message: string }>("/auth/me/password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: async () => {
      reset();
      onClose();
      // Le backend révoque les refresh tokens — déconnexion immédiate pour éviter
      // une session en état incohérent.
      await logout();
      router.replace("/login?message=mdp-change");
    },
    onError: (err: unknown) => {
      setApiError(changePasswordErrorMessage(err));
    },
  });

  const handleClose = () => {
    reset();
    setApiError(null);
    onClose();
  };

  const onSubmit = (values: FormValues) => {
    setApiError(null);
    mutation.mutate(values);
  };

  return (
    <Modal open={open} onClose={handleClose} title="Changer mon mot de passe">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <PasswordField
          id="currentPassword"
          label="Mot de passe actuel"
          error={errors.currentPassword?.message}
          registration={register("currentPassword")}
        />

        <div>
          <PasswordField
            id="newPassword"
            label="Nouveau mot de passe"
            error={errors.newPassword?.message}
            registration={register("newPassword")}
          />
          <PasswordStrength value={newPasswordValue} />
        </div>

        <PasswordField
          id="confirmPassword"
          label="Confirmer le nouveau mot de passe"
          error={errors.confirmPassword?.message}
          registration={register("confirmPassword")}
        />

        {apiError && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-600">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {apiError}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-lg bg-primary-50 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
          <p className="text-xs text-primary-700">
            Après enregistrement, vous serez déconnecté et devrez vous reconnecter avec votre
            nouveau mot de passe.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
          <Button type="submit" size="sm" loading={mutation.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
