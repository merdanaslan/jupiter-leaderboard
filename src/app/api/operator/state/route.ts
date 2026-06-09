import { noStoreJson } from "@/app/api/no-store";
import { getOperatorState } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  return noStoreJson(await getOperatorState());
}
