import { NextResponse } from "next/server";

export const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function noStoreJson<ResponseBody>(body: ResponseBody, init: ResponseInit = {}): NextResponse<ResponseBody> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(noStoreHeaders)) {
    headers.set(name, value);
  }

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}
