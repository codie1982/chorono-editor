import jwt, { JwtPayload } from "jsonwebtoken";

/**
 * Keycloak JWT Authentication Middleware
 * Validates JWT tokens from Keycloak
 * Extracts user ID and other claims
 */

export interface AuthContext {
  userId: string;
  email?: string;
  roles?: string[];
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Validate JWT token using Keycloak public key
 * In production, fetch public key from Keycloak discovery endpoint:
 * https://keycloak.your-domain/.well-known/openid-configuration
 *
 * For local development, use a dummy key or mock
 */
export async function validateJWT(token: string): Promise<AuthContext> {
  try {
    // For development: use a dummy public key or skip validation
    // In production, fetch from Keycloak discovery endpoint
    const publicKey = process.env.KEYCLOAK_PUBLIC_KEY || "dummy-key";

    // Decode without verification for dev (not secure!)
    // TODO: In production, verify signature with real public key
    const decoded = jwt.decode(token) as JwtPayload | null;

    if (!decoded) {
      throw new Error("Invalid JWT token");
    }

    // For production, use jwt.verify() instead:
    // const decoded = jwt.verify(token, publicKey, {
    //   algorithms: ["RS256"],
    //   issuer: `https://keycloak.your-domain/auth/realms/${process.env.KEYCLOAK_REALM}`,
    //   audience: process.env.KEYCLOAK_CLIENT_ID,
    // }) as JwtPayload;

    return {
      userId: decoded.sub || decoded.user_id || "",
      email: decoded.email,
      roles: decoded.roles,
    };
  } catch (err) {
    throw new Error(`JWT validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Authenticate request using JWT from Authorization header
 * Call this at the start of API route handlers
 *
 * Usage:
 * ```
 * const auth = await authenticateRequest(request)
 * const userId = auth.userId
 * ```
 */
export async function authenticateRequest(request: Request): Promise<AuthContext> {
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new Error("Missing or invalid Authorization header");
  }

  try {
    return await validateJWT(token);
  } catch (err) {
    throw new Error(`Authentication failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Helper to create error response for auth failures
 */
export function createAuthErrorResponse(message: string): Response {
  return new Response(
    JSON.stringify({
      error: "unauthorized",
      message,
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Helper to create success response
 */
export function createSuccessResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Helper for error response
 */
export function createErrorResponse(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
