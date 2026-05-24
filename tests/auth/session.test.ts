import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";

/**
 * Tests directs sur la mécanique JWT de session (sans Next cookies — qui sont
 * difficiles à mocker proprement). On vérifie que :
 *   - Un token signé avec SESSION_SECRET valide est accepté
 *   - Un token corrompu / signé avec un autre secret est rejeté
 *   - Un token expiré est rejeté
 *   - Le payload roundtripped est correct
 *
 * NB : `lib/auth/session.ts` lui-même utilise `cookies()` de Next qui ne marche
 * pas en environnement Vitest sans mock complet. Les tests d'intégration login
 * (POST /api/auth/password → cookie set) seront en smoke test e2e séparé.
 */

const VALID_SECRET = "596d72334a3107fbac6b38bf90f86b1317d199671bc8179d716937de333bb660";

function getSecretBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function signSession(
  payload: Record<string, unknown>,
  opts: { secret?: string; expiresIn?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + (opts.expiresIn ?? 60 * 60 * 24 * 365))
    .sign(getSecretBytes(opts.secret ?? VALID_SECRET));
}

describe("Session JWT (mécanique cookie youri-session)", () => {
  it("token valide signé avec SESSION_SECRET → vérification OK + payload récupéré", async () => {
    const token = await signSession({
      userId: "user-123",
      email: "stan@pangeeprod.com",
      role: "ADMIN",
      source: "PASSWORD",
    });

    const { payload } = await jwtVerify(token, getSecretBytes(VALID_SECRET), {
      algorithms: ["HS256"],
    });

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("stan@pangeeprod.com");
    expect(payload.role).toBe("ADMIN");
    expect(payload.source).toBe("PASSWORD");
  });

  it("token signé avec un autre secret → rejeté (signature mismatch)", async () => {
    const token = await signSession({ userId: "x" }, { secret: "wrong-secret-must-be-32-chars-min-aaa" });

    await expect(
      jwtVerify(token, getSecretBytes(VALID_SECRET), { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });

  it("token corrompu (chars random) → rejeté", async () => {
    await expect(
      jwtVerify("not.a.valid.jwt.token", getSecretBytes(VALID_SECRET), {
        algorithms: ["HS256"],
      }),
    ).rejects.toThrow();
  });

  it("token expiré → rejeté", async () => {
    const expiredToken = await signSession(
      { userId: "x" },
      { expiresIn: -10 }, // expirait il y a 10s
    );

    await expect(
      jwtVerify(expiredToken, getSecretBytes(VALID_SECRET), { algorithms: ["HS256"] }),
    ).rejects.toThrow(/expired|exp/i);
  });

  it("token sans signature (alg=none attempt) → rejeté", async () => {
    // Construit manuellement un token "alg:none" (vecteur d'attaque connu).
    // jwtVerify avec algorithms: ['HS256'] doit refuser.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ userId: "evil", role: "ADMIN", exp: 9999999999 }),
    ).toString("base64url");
    const fakeToken = `${header}.${payload}.`;

    await expect(
      jwtVerify(fakeToken, getSecretBytes(VALID_SECRET), { algorithms: ["HS256"] }),
    ).rejects.toThrow();
  });
});
