# Threat model

## Tài sản

Ledger và wallet, provider credential/cookie, bank beneficiary, payout approval, affiliate attribution/SubID, raw evidence, admin session/passkey và user PII.

## Trust boundaries

- Browser/PWA ↔ Next.js Route Handler/Server Action.
- Next.js ↔ Neon, Redis, QStash và S3.
- Worker ↔ AddLiveTag, Shopee, ShopeeFood, AccessTrade, Lazada và payOS.
- Admin/support/finance roles ↔ control plane.

## Controls

| Rủi ro                       | Kiểm soát                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Open redirect/SSRF           | HTTPS, exact host/subdomain allowlist, no credential/port/private IP, opaque `/go` token              |
| CSRF                         | trusted Origin check, Clerk secure session, Server Action/Route Handler re-authorization              |
| IDOR                         | mọi user query gắn `userId`; admin cần RBAC                                                           |
| Duplicate conversion/payout  | provider natural key, cross-source dedupe, DB unique, journal/idempotency key                         |
| Ledger tampering             | append-only DB trigger, deferred balanced transaction constraint, projection không là source of truth |
| Account takeover             | Google allowlist cho admin, passkey step-up, short admin session, rate limit/WAF                      |
| Identity sync/replay         | Clerk webhook signature, `svix-id` idempotency, JIT reconciliation, local status fail-closed          |
| Bank PII leak                | AES-256-GCM versioned key, last-4 UI, structured log redaction                                        |
| Provider outage/stale cookie | circuit breaker/health, >30 phút đóng băng release, không sửa conversion cũ                           |
| payOS ambiguous response     | `UNKNOWN`, query trạng thái trước retry, reservation atomic                                           |
| Service-worker data leak     | network-only cho API/auth/app/admin/go và mọi dữ liệu tài chính                                       |
| Push lock-screen leak        | generic payload, same-origin deep link, không số tiền/PII                                             |
| Supply-chain/secret leak     | frozen lockfile, audit, gitleaks, exact dependency versions, no provider secret in Prisma             |

## Privacy

Ứng dụng không lưu giấy tờ KYC. Nếu đối tác yêu cầu, người vận hành nộp trực tiếp qua portal chính thức. Không sử dụng ảnh giấy tờ cá nhân làm fixture, seed, asset, log hay support attachment.

## Kiểm thử trước beta

CSRF, SSRF, IDOR, XSS, privilege escalation, rate-limit bypass, replay, QStash signature, passkey separation, provider signature, two-payout race, late reversal, service-worker cache policy và backup restore.
