import { PublicKey } from "@solana/web3.js";

export function parseWalletAddressList(input: {
  repeated?: string[];
  combined?: string | null;
}): string[] {
  const repeated = input.repeated ?? [];
  const combined = input.combined?.split(/[,\s]+/) ?? [];

  return [...repeated, ...combined].map((address) => address.trim()).filter(Boolean);
}

export function normalizeSolanaPublicKeys(addresses: string[]): string[] {
  return addresses.map((address) => new PublicKey(address).toBase58());
}

export function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
