/**
 * API tests — F5 Factures (émission depuis un devis, machine à états)
 *
 * - AC-F5-01 POST /invoices/from-quote sur devis ACCEPTE → 201, numéro FACT-YYYY-NNNN
 * - AC-F5-02 Devis BROUILLON → 422 QUOTE_NOT_INVOICEABLE
 * - AC-F5-03 Double facturation du même devis → 409
 * - AC-F5-04 Transitions de statut légales (DRAFT→SENT→PAID)
 * - AC-F5-05 Transition illégale (DRAFT→PAID) → 422 INVALID_TRANSITION
 * - AC-F5-06 DELETE d'un brouillon → OK ; DELETE après SENT → 422 (conservation légale)
 * - AC-F5-07 Snapshot figé : lignes, mention 293 B, libellé de livraison
 */

import { test, expect } from "@playwright/test";
import { apiRequest, createQuoteWithStatus, invoiceFromQuote } from "./helpers/api";

interface InvoicePayload {
  id: string;
  invoiceNumber: string;
  status: string;
  totalHtCents: number;
  vatRate: number;
  vatAmountCents: number;
  totalTtcCents: number;
  metadata: Record<string, unknown>;
}

function invoiceOf(json: unknown): InvoicePayload {
  return (json as { data: InvoicePayload }).data;
}

test.describe("API F5 — Factures", () => {
  test("AC-F5-01 — from-quote sur devis ACCEPTE → 201 et numéro FACT-YYYY-NNNN", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const { status, json } = await invoiceFromQuote(quote.id);

    expect(status, JSON.stringify(json)).toBe(201);
    const invoice = invoiceOf(json);

    // Format de numérotation : FACT- + millésime + rang sur 4 chiffres.
    const year = new Date().getFullYear();
    expect(invoice.invoiceNumber).toMatch(new RegExp(`^FACT-${year}-\\d{4}$`));
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.metadata.quoteNumero).toBe(quote.numero);
  });

  test("AC-F5-02 — Devis BROUILLON refusé → 422 QUOTE_NOT_INVOICEABLE", async () => {
    const quote = await createQuoteWithStatus("BROUILLON");
    const { status, json } = await invoiceFromQuote(quote.id);

    expect(status).toBe(422);
    const err = (json as { error: { code: string } }).error;
    expect(err.code).toBe("QUOTE_NOT_INVOICEABLE");
  });

  test("AC-F5-03 — Devis ENVOYE accepté (le flux réel facture à l'envoi)", async () => {
    const quote = await createQuoteWithStatus("ENVOYE");
    const { status } = await invoiceFromQuote(quote.id);
    expect(status).toBe(201);
  });

  test("AC-F5-04 — Double facturation du même devis → 409", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE");

    const first = await invoiceFromQuote(quote.id);
    expect(first.status).toBe(201);

    const second = await invoiceFromQuote(quote.id);
    expect(second.status).toBe(409);
    // Le message doit nommer la facture existante pour que l'admin la retrouve.
    const err = (second.json as { error: { message: string } }).error;
    expect(err.message).toMatch(/FACT-\d{4}-\d{4}/);
  });

  test("AC-F5-05 — Transitions légales DRAFT → SENT → PAID", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const invoice = invoiceOf((await invoiceFromQuote(quote.id)).json);

    const sent = await apiRequest("PATCH", `/invoices/${invoice.id}/status`, { status: "SENT" });
    expect(sent.status).toBe(200);
    expect(invoiceOf(sent.json).status).toBe("SENT");

    const paid = await apiRequest("PATCH", `/invoices/${invoice.id}/status`, { status: "PAID" });
    expect(paid.status).toBe(200);
    const paidInvoice = invoiceOf(paid.json) as InvoicePayload & { paidAt: string | null };
    expect(paidInvoice.status).toBe("PAID");
    // Le passage à PAID doit horodater l'encaissement.
    expect(paidInvoice.paidAt).toBeTruthy();
  });

  test("AC-F5-06 — Transition illégale DRAFT → PAID → 422 INVALID_TRANSITION", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    const invoice = invoiceOf((await invoiceFromQuote(quote.id)).json);

    const { status, json } = await apiRequest("PATCH", `/invoices/${invoice.id}/status`, {
      status: "PAID",
    });

    expect(status).toBe(422);
    expect((json as { error: { code: string } }).error.code).toBe("INVALID_TRANSITION");
  });

  test("AC-F5-07 — DELETE brouillon OK, DELETE après SENT refusé (conservation)", async () => {
    // Brouillon : suppression douce autorisée.
    const draftQuote = await createQuoteWithStatus("ACCEPTE");
    const draft = invoiceOf((await invoiceFromQuote(draftQuote.id)).json);
    const deleted = await apiRequest("DELETE", `/invoices/${draft.id}`);
    expect(deleted.status).toBe(200);

    // Émise : une facture partie chez le client ne se supprime plus.
    const sentQuote = await createQuoteWithStatus("ACCEPTE");
    const sent = invoiceOf((await invoiceFromQuote(sentQuote.id)).json);
    await apiRequest("PATCH", `/invoices/${sent.id}/status`, { status: "SENT" });

    const refused = await apiRequest("DELETE", `/invoices/${sent.id}`);
    expect(refused.status).toBe(422);
    expect((refused.json as { error: { code: string } }).error.code).toBe("INVOICE_NOT_DELETABLE");
  });

  test("AC-F5-08 — Snapshot figé : lignes, TVA 293 B et libellé de livraison", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE", {
      lignes: [{ designation: "Kit Bain QA", qty: 4, unitCents: 750, position: 0 }],
      livraisonCents: 1200,
      tvaApplicable: false,
    });
    const invoice = invoiceOf((await invoiceFromQuote(quote.id)).json);

    // TVA non applicable → taux et montant à zéro, TTC = HT, mention légale figée.
    expect(invoice.vatRate).toBe(0);
    expect(invoice.vatAmountCents).toBe(0);
    expect(invoice.totalTtcCents).toBe(invoice.totalHtCents);
    expect(invoice.metadata.mentionLegale).toMatch(/293 B/);

    // Lignes recopiées, et libellé de livraison figé à l'émission (pas déduit
    // du montant à l'affichage).
    const lines = invoice.metadata.lines as Array<{ designation: string; qty: number }>;
    expect(lines).toHaveLength(1);
    const [ligne] = lines;
    expect(ligne?.designation).toBe("Kit Bain QA");
    expect(ligne?.qty).toBe(4);
    expect(invoice.metadata.livraisonLabel).toBeTruthy();

    // Cohérence interne : somme des lignes − remise + livraison = total HT.
    expect(invoice.totalHtCents).toBe(4 * 750 + 1200);
  });

  test("GET /invoices — liste paginée et filtrable par statut", async () => {
    const quote = await createQuoteWithStatus("ACCEPTE");
    await invoiceFromQuote(quote.id);

    const { status, json } = await apiRequest("GET", "/invoices?limit=5&page=1&status=DRAFT");
    expect(status).toBe(200);

    const body = json as {
      data: Array<{ invoiceNumber: string; status: string }>;
      pagination: { page: number; limit: number; total: number };
    };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.pagination.limit).toBe(5);
    for (const inv of body.data) {
      expect(inv.status).toBe("DRAFT");
    }
  });
});
