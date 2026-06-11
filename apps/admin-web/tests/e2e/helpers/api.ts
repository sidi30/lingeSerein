import { getAdminToken } from "./auth";

const API = "http://localhost:3001/api/v1";

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const token = await getAdminToken();
  const hasBody = body !== undefined;
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
  return { status: resp.status, json };
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
