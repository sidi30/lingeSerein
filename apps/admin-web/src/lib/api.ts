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
 * L'API Linge Serein renvoie toujours { success, data, error? }.
 * Cette fonction unwrap automatiquement le champ `data`.
 */
async function request<T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<T> {
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
    let errorData: { error?: { message?: string } } = {};
    try {
      errorData = (await response.json()) as typeof errorData;
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      errorData.error?.message ?? `Erreur ${response.status}`,
      errorData,
    );
  }

  if (response.status === 204) return undefined as T;

  const json = (await response.json()) as { success: boolean; data: T };
  // L'API wraps tout dans { success, data } — on unwrap
  return json.data !== undefined ? json.data : (json as unknown as T);
}

// Convenience methods — toutes les méthodes sur un objet `api`
export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(endpoint, { method: "GET", params }),

  post: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "POST", body }),

  put: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "PUT", body }),

  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: "PATCH", body }),

  delete: <T>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
};
