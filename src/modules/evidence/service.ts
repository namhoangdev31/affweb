import "server-only";

import { randomUUID } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
  type Credentials as StsCredentials
} from "@aws-sdk/client-sts";
import { getVercelOidcToken } from "@vercel/oidc";
import type { ConnectorType, EvidenceAuthority } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { loadServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { stableHash } from "@/lib/crypto";

async function oidcCredentials(roleArn: string, region: string): Promise<StsCredentials> {
  const token = await getVercelOidcToken();
  const response = await new STSClient({ region }).send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: roleArn,
      RoleSessionName: `affweb-${Date.now()}`,
      WebIdentityToken: token,
      DurationSeconds: 900
    })
  );
  if (
    !response.Credentials?.AccessKeyId ||
    !response.Credentials.SecretAccessKey ||
    !response.Credentials.SessionToken
  ) {
    throw new AppError("EVIDENCE_STORAGE", "AWS OIDC không trả về credential hợp lệ.", 503);
  }
  return response.Credentials;
}

async function evidenceS3Client(): Promise<{ client: S3Client; bucket: string }> {
  const env = loadServerEnv();
  if (!env.AWS_ROLE_ARN || !env.EVIDENCE_BUCKET) {
    throw new AppError("EVIDENCE_STORAGE", "S3 evidence storage chưa được cấu hình.", 503);
  }
  const credentials = await oidcCredentials(env.AWS_ROLE_ARN, env.AWS_REGION);
  return {
    client: new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: credentials.AccessKeyId!,
        secretAccessKey: credentials.SecretAccessKey!,
        sessionToken: credentials.SessionToken!
      }
    }),
    bucket: env.EVIDENCE_BUCKET
  };
}

export async function storeRawEvidence(input: {
  provider: ConnectorType;
  kind: string;
  authority: EvidenceAuthority;
  externalRef?: string;
  payload: unknown;
  rawBody?: string;
  contentType?: string;
  extension?: string;
  metadata?: Record<string, string | number | boolean | null>;
  schemaVersion?: number;
}) {
  const env = loadServerEnv();
  const body = input.rawBody ?? JSON.stringify(input.payload);
  const sha256 = stableHash(body);
  const date = new Date();
  const objectKey = [
    "raw",
    input.provider.toLowerCase(),
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    `${date.toISOString()}-${sha256.slice(0, 16)}-${randomUUID()}.${input.extension ?? "json"}`
  ].join("/");

  if (env.NODE_ENV === "production") {
    const { client, bucket } = await evidenceS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: input.contentType ?? "application/json",
        ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: new Date(
          Date.now() + env.EVIDENCE_OBJECT_LOCK_DAYS * 24 * 60 * 60 * 1000
        ),
        ServerSideEncryption: "aws:kms"
      })
    );
  }

  return db.rawEvidence.create({
    data: {
      provider: input.provider,
      kind: input.kind,
      authority: input.authority,
      sha256,
      objectKey:
        env.NODE_ENV === "production" ? objectKey : `development-not-uploaded/${objectKey}`,
      externalRef: input.externalRef ?? null,
      schemaVersion: input.schemaVersion ?? 1,
      metadata: {
        bytes: Buffer.byteLength(body),
        uploaded: env.NODE_ENV === "production",
        ...(input.metadata ?? {})
      }
    }
  });
}

export async function verifyEvidenceIntegrity(): Promise<{
  checked: number;
  failed: Array<{ id: string; reason: string }>;
}> {
  const env = loadServerEnv();
  const failed: Array<{ id: string; reason: string }> = [];
  let checked = 0;
  let cursor: string | undefined;
  const storage = env.NODE_ENV === "production" ? await evidenceS3Client() : undefined;

  do {
    const rows = await db.rawEvidence.findMany({
      take: 200,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    for (const row of rows) {
      checked += 1;
      if (!/^[a-f0-9]{64}$/.test(row.sha256)) {
        failed.push({ id: row.id, reason: "invalid_sha256" });
        continue;
      }
      if (storage) {
        try {
          const head = await storage.client.send(
            new HeadObjectCommand({
              Bucket: storage.bucket,
              Key: row.objectKey,
              ChecksumMode: "ENABLED"
            })
          );
          const expected = Buffer.from(row.sha256, "hex").toString("base64");
          if (head.ChecksumSHA256 && head.ChecksumSHA256 !== expected) {
            failed.push({ id: row.id, reason: "checksum_mismatch" });
          }
        } catch {
          failed.push({ id: row.id, reason: "object_missing_or_unreadable" });
        }
      }
    }
    cursor = rows.at(-1)?.id;
    if (rows.length < 200) cursor = undefined;
  } while (cursor);

  if (failed.length > 0) {
    throw new AppError(
      "EVIDENCE_INTEGRITY",
      `Raw evidence integrity failed for ${failed.length} object(s).`,
      503,
      { checked, failed: failed.slice(0, 50) }
    );
  }
  return { checked, failed };
}
