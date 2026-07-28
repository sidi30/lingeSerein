"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { DeleteAction } from "@/components/ui/delete-action";
import { Plus, UserCog } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { PaginatedResponse, UserDTO, UserRole } from "@/lib/types";
import { EmailText } from "@/components/ui/email-text";
import { useClampedPage } from "@/lib/use-clamped-page";

const roleOptions = [
  { value: "", label: "Tous les rôles" },
  { value: "ROLE_CLIENT", label: "Client" },
  { value: "ROLE_LIVREUR", label: "Livreur" },
  { value: "ROLE_ADMIN", label: "Admin" },
];

const statusOptions = [
  { value: "", label: "Tous les statuts" },
  { value: "active", label: "Actif" },
  { value: "inactive", label: "Inactif" },
];

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

const roleConfig: Record<UserRole, { label: string; variant: BadgeVariant }> = {
  ROLE_CLIENT: { label: "Client", variant: "info" },
  ROLE_LIVREUR: { label: "Livreur", variant: "default" },
  ROLE_ADMIN: { label: "Admin", variant: "warning" },
  ROLE_SUPER_ADMIN: { label: "Super Admin", variant: "danger" },
};

export default function UtilisateursPage() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    const t = setTimeout(() => {
      setSearchDebounced(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["users", page, roleFilter, statusFilter, searchDebounced],
    queryFn: () =>
      api.getRaw<PaginatedResponse<UserDTO>>("/users", {
        page,
        limit: 25,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        search: searchDebounced || undefined,
      }),
  });

  const users = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  useClampedPage(page, totalPages, setPage);

  return (
    <>
      <Header
        title="Utilisateurs"
        actions={
          <Link href="/utilisateurs/nouveau">
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvel utilisateur
            </Button>
          </Link>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full max-w-xs">
              <SearchInput
                placeholder="Nom ou email..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                onClear={() => handleSearch("")}
              />
            </div>
            <div className="w-36">
              <Select
                options={roleOptions}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrer par rôle"
              />
            </div>
            <div className="w-36">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrer par statut"
              />
            </div>
            {(search || roleFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSearchDebounced("");
                  setRoleFilter("");
                  setStatusFilter("");
                  setPage(1);
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
          {pagination && (
            <p className="text-sm text-gray-500">
              {pagination.total} utilisateur{pagination.total > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<UserCog className="h-12 w-12" />}
            title={
              search || roleFilter || statusFilter
                ? "Aucun utilisateur trouvé"
                : "Aucun utilisateur"
            }
            description={
              search || roleFilter || statusFilter
                ? "Essayez de modifier vos filtres."
                : "Créez votre premier compte utilisateur."
            }
            action={
              <Link href="/utilisateurs/nouveau">
                <Button size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nouvel utilisateur
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <Table>
              <Thead>
                <tr>
                  <Th>Nom</Th>
                  <Th>Email</Th>
                  <Th>Rôle</Th>
                  <Th>Zone</Th>
                  <Th>Statut</Th>
                  <Th>Créé le</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </Thead>
              <tbody>
                {users.map((user) => {
                  const rc = roleConfig[user.role] ?? {
                    label: user.role,
                    variant: "neutral" as BadgeVariant,
                  };
                  const isActive = !user.deletedAt;
                  return (
                    <Tr key={user.id} onClick={() => router.push(`/utilisateurs/${user.id}`)}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{user.name}</span>
                        </div>
                      </Td>
                      <Td>
                        <EmailText email={user.email} className="text-gray-600" />
                      </Td>
                      <Td>
                        <Badge variant={rc.variant}>{rc.label}</Badge>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-600">
                          {user.zone?.name ?? <span className="text-gray-400">—</span>}
                        </span>
                      </Td>
                      <Td>
                        <Badge variant={isActive ? "success" : "neutral"}>
                          {isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="text-sm text-gray-500">{formatDate(user.createdAt)}</span>
                      </Td>
                      <Td className="text-right">
                        {/* L'API refuse l'auto-suppression (422 CANNOT_DELETE_SELF).
                            On le reflète ici plutôt que de laisser partir un
                            appel dont on connaît déjà le refus. */}
                        <DeleteAction
                          endpoint={`/users/${user.id}`}
                          itemLabel={user.name}
                          title={`Supprimer ${user.name} ?`}
                          description="Le compte est désactivé et ses sessions sont révoquées immédiatement. Son historique (commandes, factures) reste attaché à son nom."
                          successMessage="Compte supprimé"
                          disabledReason={
                            currentUser?.id === user.id
                              ? "Vous ne pouvez pas supprimer votre propre compte."
                              : null
                          }
                          requireTypedText={user.name}
                          scopes={["user"]}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={pagination?.total ?? 0}
              label="utilisateurs"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
