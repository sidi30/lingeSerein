/**
 * API tests — F2 Demandes mobiles
 *
 * AC-F2-04 Refus commande sans raison → 400
 * AC-F2-05 Refus avec raison → statut CANCELLED
 * EP-O01  GET /orders retourne meta.newCount
 * EP-O02  GET /orders/:id retourne statusHistory + items
 * EP-O03  Transition invalide → 422 INVALID_TRANSITION
 * Filtre source orders
 */

import { test, expect } from "@playwright/test";
import { getAdminToken } from "./helpers/auth";

const API = "http://localhost:3001/api/v1";

async function raw(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const tok = await getAdminToken();
  const hasBody = body !== undefined;
  const resp = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${tok}`,
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  let json: unknown;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  return { status: resp.status, json };
}

async function getFirstPendingOrderId(): Promise<string | null> {
  const { json } = await raw("GET", "/orders?status=PENDING&limit=5");
  const data = (json as { data: Array<{ id: string; status: string }> }).data;
  return data?.[0]?.id ?? null;
}

test.describe("API F2 — Commandes", () => {
  test("EP-O01 — GET /orders retourne meta.newCount (admin uniquement)", async () => {
    const { status, json } = await raw("GET", "/orders");
    expect(status, `Expected 200, got ${status}. Body: ${JSON.stringify(json)}`).toBe(200);
    const body = json as {
      success: boolean;
      data: unknown[];
      pagination: unknown;
      meta?: { newCount?: number };
    };
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
    // meta.newCount must be present for admin
    expect(body.meta).toBeDefined();
    expect(typeof body.meta?.newCount).toBe("number");
  });

  test("EP-O02 — GET /orders/:id retourne statusHistory, items, user complet", async () => {
    const { json } = await raw("GET", "/orders?limit=5");
    const orders = (json as { data: Array<{ id: string }> }).data;
    if (!orders || orders.length === 0) {
      console.warn("No orders in DB, skipping detail test");
      return;
    }
    const orderId = orders[0].id;
    const { status, detailJson } = await (async () => {
      const r = await raw("GET", `/orders/${orderId}`);
      return { status: r.status, detailJson: r.json };
    })();

    expect(status, `Expected 200, got ${status}. Body: ${JSON.stringify(detailJson)}`).toBe(200);
    const data = (detailJson as { data: Record<string, unknown> }).data;
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.user).toBeDefined();
    const user = data.user as Record<string, unknown>;
    expect(user.name).toBeDefined();
    expect(user.email).toBeDefined();
    // statusHistory is sourced from AuditLog
    expect(Array.isArray(data.statusHistory)).toBe(true);
  });

  test("AC-F2-04 — PATCH /orders/:id/status CANCELLED sans raison → 400", async () => {
    const orderId = await getFirstPendingOrderId();
    if (!orderId) {
      console.warn("No PENDING order found, skipping raison obligatoire test");
      return;
    }

    const { status, json } = await raw("PATCH", `/orders/${orderId}/status`, {
      status: "CANCELLED",
      // raison intentionnellement absent
    });

    expect(status, `Expected 400, got ${status}. Body: ${JSON.stringify(json)}`).toBe(400);
    const err = (json as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toMatch(/raison|obligatoire/i);
  });

  test("AC-F2-05 — PATCH /orders/:id/status CANCELLED avec raison valide → statut CANCELLED", async () => {
    const orderId = await getFirstPendingOrderId();
    if (!orderId) {
      console.warn("No PENDING order found, skipping CANCELLED with raison test");
      return;
    }

    const { status, json } = await raw("PATCH", `/orders/${orderId}/status`, {
      status: "CANCELLED",
      raison: "Créneau indisponible sur votre zone",
    });

    expect(status, `Expected 200, got ${status}. Body: ${JSON.stringify(json)}`).toBe(200);
    const data = (json as { data: Record<string, unknown> }).data;
    expect(data.status).toBe("CANCELLED");
    expect(data.cancelledReason).toBe("Créneau indisponible sur votre zone");
    expect(data.cancelledAt).toBeTruthy();
  });

  test("EP-O03 — Transition invalide sur commande CANCELLED → 422", async () => {
    // Find a CANCELLED order
    const { json } = await raw("GET", "/orders?status=CANCELLED&limit=5");
    const orders = (json as { data: Array<{ id: string }> }).data;
    if (!orders || orders.length === 0) {
      console.warn("No CANCELLED order to test invalid transition");
      return;
    }
    const orderId = orders[0].id;

    const { status, json: respJson } = await raw("PATCH", `/orders/${orderId}/status`, {
      status: "CONFIRMED",
    });
    expect(status, `Expected 422, got ${status}. Body: ${JSON.stringify(respJson)}`).toBe(422);
    const err = (respJson as { error: { code: string } }).error;
    expect(err.code).toBe("INVALID_TRANSITION");
  });

  test("GET /orders?source=MOBILE filtre par source", async () => {
    const { status, json } = await raw("GET", "/orders?source=MOBILE");
    expect(status, `Expected 200, got ${status}. Body: ${JSON.stringify(json)}`).toBe(200);
    const body = json as { data: Array<{ source?: string }> };
    for (const order of body.data) {
      expect(order.source).toBe("MOBILE");
    }
  });
});
