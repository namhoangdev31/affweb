import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON
} from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const CHALLENGE_TTL_SECONDS = 5 * 60;

type ChallengeType = "registration" | "authentication";

function challengeCookieName(): string {
  return loadServerEnv().NODE_ENV === "production"
    ? "__Host-affweb-passkey-challenge"
    : "affweb-passkey-challenge";
}

function webAuthnConfig() {
  const env = loadServerEnv();
  const origin = new URL(env.APP_BASE_URL).origin;
  return { origin, rpID: new URL(origin).hostname };
}

function challengeSecret(): string {
  const secret = loadServerEnv().WEBAUTHN_CHALLENGE_SECRET;
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "WEBAUTHN_CHALLENGE_SECRET chưa được cấu hình.", 503);
  }
  return secret;
}

function signChallenge(challenge: string, type: ChallengeType, expiresAt: number): string {
  const value = `${challenge}.${type}.${expiresAt}`;
  const signature = createHmac("sha256", challengeSecret()).update(value).digest("base64url");
  return `${value}.${signature}`;
}

async function saveChallenge(challenge: string, type: ChallengeType): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
  (await cookies()).set(challengeCookieName(), signChallenge(challenge, type, expiresAt), {
    httpOnly: true,
    secure: loadServerEnv().NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS
  });
}

async function consumeChallenge(type: ChallengeType): Promise<string> {
  const store = await cookies();
  const cookieName = challengeCookieName();
  const payload = store.get(cookieName)?.value;
  store.delete(cookieName);
  const [challenge, storedType, expiresRaw, signature] = payload?.split(".") ?? [];
  if (!challenge || storedType !== type || !expiresRaw || !signature) {
    throw new AppError("VALIDATION_ERROR", "Passkey challenge không hợp lệ.", 400);
  }
  const unsigned = `${challenge}.${storedType}.${expiresRaw}`;
  const expected = createHmac("sha256", challengeSecret()).update(unsigned).digest();
  const received = Buffer.from(signature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected) ||
    Number(expiresRaw) < Math.floor(Date.now() / 1000)
  ) {
    throw new AppError("VALIDATION_ERROR", "Passkey challenge đã hết hạn.", 400);
  }
  return challenge;
}

export async function registrationOptions(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) {
  const { rpID } = webAuthnConfig();
  const credentials = await db.adminPasskey.findMany({ where: { userId: user.id } });
  const options = await generateRegistrationOptions({
    rpName: "Hoàn Tiền Admin",
    rpID,
    userName: user.email ?? user.id,
    userDisplayName: user.name ?? user.email ?? "Admin",
    userID: new TextEncoder().encode(user.id),
    timeout: 60_000,
    attestationType: "none",
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as never
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required"
    }
  });
  await saveChallenge(options.challenge, "registration");
  return options;
}

export async function verifyRegistration(userId: string, response: RegistrationResponseJSON) {
  const { origin, rpID } = webAuthnConfig();
  const expectedChallenge = await consumeChallenge("registration");
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true
  });
  if (!verification.verified) {
    throw new AppError("VALIDATION_ERROR", "Không xác minh được passkey.", 400);
  }
  const { credential, credentialBackedUp } = verification.registrationInfo;
  await db.adminPasskey.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: response.response.transports ?? [],
      backedUp: credentialBackedUp,
      lastUsedAt: new Date()
    }
  });
  return { verified: true };
}

export async function authenticationOptions(userId: string) {
  const { rpID } = webAuthnConfig();
  const credentials = await db.adminPasskey.findMany({ where: { userId } });
  if (!credentials.length) {
    throw new AppError("NOT_FOUND", "Admin chưa đăng ký passkey.", 404);
  }
  const options = await generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as never
    }))
  });
  await saveChallenge(options.challenge, "authentication");
  return options;
}

export async function verifyAuthentication(userId: string, response: AuthenticationResponseJSON) {
  const { origin, rpID } = webAuthnConfig();
  const challenge = await consumeChallenge("authentication");
  const credential = await db.adminPasskey.findFirst({
    where: { userId, credentialId: response.id }
  });
  if (!credential) throw new AppError("NOT_FOUND", "Passkey không tồn tại.", 404);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: Number(credential.counter),
      transports: credential.transports as never
    },
    requireUserVerification: true
  });
  if (!verification.verified) {
    throw new AppError("VALIDATION_ERROR", "Passkey assertion không hợp lệ.", 400);
  }
  await db.adminPasskey.update({
    where: { id: credential.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date()
    }
  });
  return { verified: true, validForSeconds: 600 };
}
