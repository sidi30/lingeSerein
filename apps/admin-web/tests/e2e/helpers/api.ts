import { getAdminToken } from "./auth";

const API = "http://localhost:3001/api/v1";

/**
 * Appel authentifié à l'API, avec attente sur 429.
 *
 * Le limiteur de débit de l'API est un comportement VOULU, pas un défaut : une
 * suite qui crée un utilisateur par test le déclenche forcément. Sans cette
 * attente, des scénarios verts échouaient au hasard selon leur position dans la
 * série — un faux rouge qui masque les vrais. On respecte le `retry-after`
 * annoncé par le serveur plutôt qu'un délai deviné.
 */
export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const hasBody = body !== undefined;

  for (let tentative = 0; ; tentative++) {
    const token = await getAdminToken();
    const resp = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    let json: unknown;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }

    if (resp.status !== 429 || tentative >= 3) return { status: resp.status, json };

    const annonce = Number(resp.headers.get("retry-after"));
    const attenteMs = (Number.isFinite(annonce) && annonce > 0 ? annonce : 5) * 1000 + 500;
    await new Promise((r) => setTimeout(r, attenteMs));
  }
}

export async function createQuote(
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; numero: string }> {
  const { status } = await apiRequest("POST", "/quotes", {
    clientNom: "Test Client QA",
    clientEmail: "client.qa@example.com",
    lignes: [{ designation: "Serviette de bain", qty: 10, unitCents: 200, position: 0 }],
    remisePct: 0,
    livraisonCents: 1000,
    tvaApplicable: false,
    validiteJours: 30,
    ...overrides,
  });
  if (status !== 201) throw new Error(`createQuote failed: ${status}`);

  // Workaround for BUG-001: POST /quotes returns data:{} (Fastify serialization)
  // Fetch the latest quote from the list instead
  const listResult = await apiRequest("GET", "/quotes?limit=1&page=1");
  const listData = (listResult.json as { data: Array<{ id: string; numero: string }> }).data;
  if (!listData || listData.length === 0)
    throw new Error("createQuote: no quotes in list after creation");
  return { id: listData[0].id, numero: listData[0].numero };
}

export async function createUser(
  overrides: Record<string, unknown> = {},
): Promise<{ user: { id: string }; temporaryPassword: string }> {
  const ts = Date.now();
  const email = (overrides.email as string) ?? `qa.livreur.${ts}@example.com`;
  const { status, json } = await apiRequest("POST", "/users", {
    name: `QA Livreur ${ts}`,
    email,
    role: "LIVREUR",
    ...overrides,
  });
  if (status !== 201) throw new Error(`createUser failed: ${status} ${JSON.stringify(json)}`);

  // BUG-002: POST /users returns data:{ user:{}, temporaryPassword:"..." }
  // Extract temporaryPassword from response, get actual user from list
  const responseData = (json as { data: { user: unknown; temporaryPassword: string } }).data;
  const temporaryPassword = responseData.temporaryPassword;

  // Find the created user by email
  const listResult = await apiRequest("GET", `/users?search=${encodeURIComponent(email)}`);
  const users = (listResult.json as { data: Array<{ id: string }> }).data;
  if (!users || users.length === 0)
    throw new Error(`createUser: user ${email} not found after creation`);

  return { user: { id: users[0].id }, temporaryPassword };
}

/** Fait transiter un devis vers un statut (BROUILLON → ENVOYE → ACCEPTE). */
export async function setQuoteStatus(quoteId: string, status: string): Promise<void> {
  const { status: httpStatus, json } = await apiRequest("PATCH", `/quotes/${quoteId}/status`, {
    status,
  });
  if (httpStatus !== 200) {
    throw new Error(`setQuoteStatus(${status}) failed: ${httpStatus} ${JSON.stringify(json)}`);
  }
}

/**
 * Crée un devis puis l'amène au statut voulu. Les transitions sont séquentielles
 * (la machine à états n'autorise pas BROUILLON → ACCEPTE directement).
 */
export async function createQuoteWithStatus(
  status: "BROUILLON" | "ENVOYE" | "ACCEPTE",
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; numero: string }> {
  const quote = await createQuote(overrides);
  if (status === "BROUILLON") return quote;
  await setQuoteStatus(quote.id, "ENVOYE");
  if (status === "ACCEPTE") await setQuoteStatus(quote.id, "ACCEPTE");
  return quote;
}

/** Émet une facture depuis un devis. Retourne le statut HTTP et le corps brut. */
export async function invoiceFromQuote(
  quoteId: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; json: unknown }> {
  return apiRequest("POST", `/invoices/from-quote/${quoteId}`, body);
}
