"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, FileText, ShoppingCart, UserPlus, PackageMinus } from "lucide-react";
import {
  useUnreadCounts,
  useNotificationsList,
  useMarkNotificationRead,
  useMarkAllRead,
  formatRelativeTime,
  type NotificationDTO,
} from "@/lib/notifications";

/** Icône par type, pour repérer la nature d'une notification d'un coup d'œil. */
function iconForType(type: string) {
  switch (type) {
    case "QUOTE_CREATED":
      return <FileText className="h-4 w-4 text-primary-600" aria-hidden="true" />;
    case "ORDER_CREATED":
      return <ShoppingCart className="h-4 w-4 text-primary-600" aria-hidden="true" />;
    case "USER_CREATED":
      return <UserPlus className="h-4 w-4 text-primary-600" aria-hidden="true" />;
    case "STOCK_LOW":
      return <PackageMinus className="h-4 w-4 text-danger-600" aria-hidden="true" />;
    default:
      return <Bell className="h-4 w-4 text-gray-400" aria-hidden="true" />;
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = useUnreadCounts();
  const totalUnread = Object.values(unread).reduce((sum, n) => sum + n, 0);

  const { data, isLoading } = useNotificationsList(open);
  const notifications = data?.data ?? [];

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  // Échap ferme le panneau — un menu qu'on ne peut fermer qu'à la souris est
  // une impasse au clavier.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleClick = (n: NotificationDTO) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    const href = typeof n.data?.href === "string" ? n.data.href : null;
    if (href) router.push(href);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label={
          totalUnread > 0
            ? `Notifications — ${totalUnread} non lue${totalUnread > 1 ? "s" : ""}`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {totalUnread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Fermer les notifications"
            tabIndex={-1}
          />
          {/* Largeur bornée au viewport : sur un écran de 390px, un panneau fixe
              de 380px déborderait à droite. max-h + overflow-y : la liste défile
              dans le panneau, elle ne pousse pas la page. */}
          <div
            ref={panelRef}
            className="absolute right-0 z-20 mt-1 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-sm flex-col rounded-lg border border-gray-200 bg-white shadow-lg"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">
                Notifications
                {totalUnread > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {totalUnread} non lue{totalUnread > 1 ? "s" : ""}
                  </span>
                )}
              </p>
              {totalUnread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Tout marquer lu
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading && (
                <p className="px-4 py-6 text-center text-sm text-gray-400">Chargement…</p>
              )}

              {!isLoading && notifications.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="mx-auto h-8 w-8 text-gray-300" aria-hidden="true" />
                  <p className="mt-2 text-sm text-gray-500">Aucune notification</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Les nouveaux devis et commandes apparaîtront ici.
                  </p>
                </div>
              )}

              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50 ${
                    n.readAt ? "" : "bg-primary-50/40"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">{iconForType(n.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        n.readAt ? "text-gray-700" : "font-semibold text-gray-900"
                      }`}
                    >
                      {n.title}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{n.body}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-400">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </span>
                  {!n.readAt && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-600"
                      aria-label="Non lue"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
