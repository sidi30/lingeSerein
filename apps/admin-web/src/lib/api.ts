const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

let accessToken: string | null = null;

export function getToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("linge_serein_token");
  }
  return accessToken;
}

export function setToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("linge_serein_token", token);
    } else {
      localStorage.removeItem("linge_serein_token");
    }
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Envoie la requête et rend la réponse BRUTE, une fois les cas d'échec traités
 * (401 → déconnexion, !ok → ApiError portant le message et le code métier).
 *
 * Ce socle est partagé par les trois formes de lecture ci-dessous. Il existait
 * auparavant en deux copies, et la moindre correction devait être appliquée
 * deux fois — à la troisième forme, la duplication devenait intenable.
 */
async function rawFetch(endpoint: string, options: RequestOptions = {}): Promise<Response> {
  const { body, params, headers: customHeaders, ...rest } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) search.set(key, String(value));
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
  }

  // `Content-Type: application/json` UNIQUEMENT s'il y a un corps. Fastify
  // refuse en 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`) une requête qui annonce du
  // JSON sans en envoyer : posé systématiquement, cet en-tête cassait TOUTES
  // les suppressions de l'admin (devis, facture, zone, utilisateur…). Le bouton
  // affichait l'erreur de l'API et la fiche restait en place.
  const headers: Record<string, string> = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(customHeaders as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Non autorisé");
  }

  if (!response.ok) {
    let errorData: { error?: { message?: string; code?: string }; success?: boolean } = {};
    try {
      errorData = (await response.json()) as typeof errorData;
    } catch {
      // ignore
    }
    const err = new ApiError(
      response.status,
      errorData.error?.message ?? `Erreur ${response.status}`,
      errorData,
    );
    // Expose le code métier pour discrimination côté front
    (err as ApiError & { code?: string }).code = errorData.error?.code;
    throw err;
  }

  return response;
}

/**
 * L'API Linge Serein renvoie toujours { success, data, error? }.
 * Cette fonction unwrap automatiquement le champ `data`.
 */
async function request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawFetch(endpoint, options);

  if (response.status === 204) return undefined as T;

  const json = (await response.json()) as { success: boolean; data: T };
  // L'API wraps tout dans { success, data } — on unwrap
  return json.data !== undefined ? json.data : (json as unknown as T);
}

/**
 * Variante de request qui retourne l'enveloppe complète sans unwrap.
 * Nécessaire pour les listes paginées (ADR-011) afin de préserver `pagination` et `meta`.
 */
async function requestRaw<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawFetch(endpoint, options);

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** Donnée déballée, accompagnée du code HTTP de la réponse. */
export interface ApiResult<T> {
  data: T;
  status: number;
}

/**
 * Variante de request qui expose AUSSI le code HTTP.
 *
 * Nécessaire aux routes idempotentes, où seul le code distingue deux issues que
 * le corps ne différencie pas : `POST /quotes/from-order/:id` renvoie 201 quand
 * il vient de créer le devis et 200 quand il retrouve celui déjà émis. Sans le
 * code, l'écran annoncerait « devis créé » sur un devis qui existait déjà.
 */
async function requestWithStatus<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const response = await rawFetch(endpoint, options);

  if (response.status === 204) return { data: undefined as T, status: response.status };

  const json = (await response.json()) as { success: boolean; data: T };
  return {
    data: json.data !== undefined ? json.data : (json as unknown as T),
    status: response.status,
  };
}

// Convenience methods — toutes les méthodes sur un objet `api`
export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(endpoint, { method: "GET", params }),

  /**
   * Retourne l'enveloppe brute { success, data, pagination?, meta? } sans unwrap.
   * À utiliser pour les listes paginées (ADR-011).
   */
  getRaw: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    requestRaw<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "POST", body }),

  /**
   * POST qui rend aussi le code HTTP. À réserver aux routes idempotentes, où
   * 200 (ressource déjà là) et 201 (créée) portent le même corps.
   */
  postWithStatus: <T>(endpoint: string, body?: unknown) =>
    requestWithStatus<T>(endpoint, { method: "POST", body }),

  put: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "PUT", body }),

  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "PATCH", body }),

  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};
