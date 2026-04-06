"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  RefreshCw,
  Package,
  Database,
  CalendarDays,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Vue d'ensemble",
    items: [
      { label: "Tableau de bord", href: "/", icon: <LayoutDashboard className="h-5 w-5" /> },
    ],
  },
  {
    title: "Commercial",
    items: [
      { label: "Clients", href: "/clients", icon: <Users className="h-5 w-5" /> },
      { label: "Commandes", href: "/commandes", icon: <ClipboardList className="h-5 w-5" /> },
      { label: "Abonnements", href: "/abonnements", icon: <RefreshCw className="h-5 w-5" /> },
    ],
  },
  {
    title: "Opérations",
    items: [
      { label: "Produits", href: "/produits", icon: <Package className="h-5 w-5" /> },
      { label: "Stock", href: "/stock", icon: <Database className="h-5 w-5" /> },
      { label: "Planning", href: "/planning", icon: <CalendarDays className="h-5 w-5" /> },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {navGroups.map((group) => (
        <div key={group.title} className="mb-2">
          {!collapsed && (
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {group.title}
            </p>
          )}
          {collapsed && group.title !== "Vue d'ensemble" && (
            <div className="mx-auto my-2 h-px w-6 bg-gray-200" />
          )}
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" />
      )}

      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-lg bg-white p-2 shadow-md lg:hidden"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-gray-200 bg-white transition-transform lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Linge Serein" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-lg font-bold text-gray-900">Linge Serein</span>
          </div>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white ${
          collapsed ? "lg:w-[68px]" : "lg:w-60"
        } transition-all duration-200`}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-100 px-3">
          <div className="flex items-center gap-2 overflow-hidden">
            <Image src="/logo.png" alt="Linge Serein" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            {!collapsed && <span className="text-lg font-bold text-gray-900">Linge Serein</span>}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Réduire le menu"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
        </div>
        {nav}
        {collapsed && (
          <div className="border-t border-gray-100 p-2">
            <button
              onClick={() => setCollapsed(false)}
              className="flex w-full items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Ouvrir le menu"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
