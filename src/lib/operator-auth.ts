export interface OperatorAuthInput {
  authorizationHeader: string | null | undefined;
  operatorPassword: string | null | undefined;
}

export function isOperatorAuthorized(input: OperatorAuthInput): boolean {
  const expectedPassword = input.operatorPassword?.trim();
  if (!expectedPassword) return false;

  const credentials = parseBasicAuth(input.authorizationHeader);
  if (!credentials) return false;

  return credentials.password === expectedPassword;
}

export function getBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function parseBasicAuth(authorizationHeader: string | null | undefined):
  | { username: string; password: string }
  | null {
  if (!authorizationHeader?.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(authorizationHeader.slice("Basic ".length), "base64").toString(
      "utf8",
    );
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}
