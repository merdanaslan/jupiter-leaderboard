// @vitest-environment node

import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeSolstreamUpdate } from "./solstream-client";

describe("Solstream client decoding", () => {
  it("decodes account updates into base58 keys and raw account bytes", () => {
    const pubkey = new PublicKey("5TRxgLWsCFc9FfgfzBZoet3wMriLGMFBjfjjtAjVHohN");
    const owner = new PublicKey("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu");

    const update = decodeSolstreamUpdate({
      account: {
        account: {
          pubkey: pubkey.toBytes(),
          owner: owner.toBytes(),
          lamports: 123n,
          rentEpoch: 0n,
          data: Uint8Array.from([1, 2, 3]),
          writeVersion: 9n,
        },
        slot: 42n,
        isStartup: true,
      },
    });

    expect(update).toEqual({
      kind: "account",
      data: expect.objectContaining({
        pubkey: pubkey.toBase58(),
        owner: owner.toBase58(),
        slot: 42,
        lamports: 123n,
        data: Uint8Array.from([1, 2, 3]),
        isStartup: true,
      }),
    });
  });

  it("decodes transaction updates with signatures, account keys, and inner instruction bytes", () => {
    const signer = new PublicKey("5TRxgLWsCFc9FfgfzBZoet3wMriLGMFBjfjjtAjVHohN");
    const signature = Uint8Array.from(Array.from({ length: 64 }, (_, index) => index + 1));

    const update = decodeSolstreamUpdate({
      transaction: {
        transaction: {
          signature,
          transaction: {
            message: {
              accountKeys: [signer.toBytes()],
            },
          },
          transactionMeta: {
            err: undefined,
            logMessages: ["Program log: test"],
            innerInstructions: [
              {
                index: 0,
                instructions: [
                  {
                    instruction: {
                      programIdIndex: 1,
                      accounts: Uint8Array.from([0]),
                      data: Uint8Array.from([9, 8, 7]),
                    },
                    stackHeight: 2,
                  },
                ],
              },
            ],
          },
        },
        slot: 99n,
      },
    });

    expect(update).toEqual({
      kind: "transaction",
      data: expect.objectContaining({
        slot: 99,
        success: true,
        accountKeys: [signer.toBase58()],
        logMessages: ["Program log: test"],
        innerInstructions: [
          {
            index: 0,
            instructions: [
              {
                stackHeight: 2,
                instruction: {
                  programIdIndex: 1,
                  accounts: Uint8Array.from([0]),
                  data: Uint8Array.from([9, 8, 7]),
                },
              },
            ],
          },
        ],
      }),
    });
  });

  it("decodes slot updates", () => {
    expect(
      decodeSolstreamUpdate({
        slot: {
          slotInfo: {
            slot: 123n,
            parent: 122n,
            status: 3,
          },
        },
      }),
    ).toEqual({
      kind: "slot",
      data: {
        slot: 123,
        parent: 122,
        status: 3,
      },
    });
  });
});
