# Project Context — Hoàn Tiền (`affweb`)

Tài liệu này là bản đồ tư duy cấp cao của dự án. Đọc cùng `AGENTS.md` trước khi sửa code; dùng `project_map.json` khi cần tra từng file, route, hàm, method, import/export hoặc model Prisma.

## 1. Mục tiêu sản phẩm

`affweb` là web app/PWA affiliate cashback tại Việt Nam. Người dùng tạo link affiliate, đi qua redirect nội bộ có attribution và hệ thống đồng bộ conversion từ nhiều nguồn. Flow master dùng ledger/wallet/payOS core; flow tenant sau cutover dùng treasury, nghĩa vụ cashback, ví member và payout aggregate riêng, còn lịch sử tenant external-settlement trước cutover được giữ nguyên.

Các nền tảng hiện có:

- Shopee Marketplace: direct link; Orders dùng CSV `Báo cáo chuyển đổi`, còn settlement chỉ được mở
  khi có file chi tiết **Hóa đơn đối soát** đã đóng và exact line tie-out.
- ShopeeFood: direct `an_redir` với `source=food`; cashback có kill switch riêng.
- AddLiveTag: connector/catalog hiện có vẫn được giữ; Clean Link, Find AFF ID và thuế 2026 được
  triển khai nội bộ sau đăng nhập, không tạo thêm phụ thuộc endpoint tool riêng.
- AccessTrade: `/v1/product_link/create`, transaction/order/product/detail sync; `approved` chỉ
  validate, Finance settlement mới release.
- Lazada: `/marketing/getlink` và `/marketing/conversion/report`; order API chỉ validate, Finance
  settlement mới release.

Stack chính:

- Next.js 16 App Router, React 19, TypeScript strict.
- PostgreSQL/Neon, Prisma 7 và `@prisma/adapter-pg`.
- Clerk cho identity; role và trạng thái nghiệp vụ nằm trong PostgreSQL.
- Upstash Redis + QStash cho cache/rate limit/job.
- PayOS cho billing/funding/payout dùng chung một credential set hiện có nhưng kill switch nghiệp vụ độc lập; Resend cho email; Web Push cho PWA.
- AWS S3 Object Lock cho raw evidence production; Sentry cho observability.
- Tenant/KOC SaaS dùng master tenant, path/slug, plan catalog trong PostgreSQL, PayOS subscription invoice và một Zalo Bot trung tâm. Business có thể dùng tenant-managed Lazada/AccessTrade credential sau preflight. Tenant finance có journal/projection riêng và chỉ hoạt động khi cả env, global DB flag và tenant flag đều bật.
- Vercel là runtime/deployment target. Không sử dụng GitHub Actions; chất lượng code (quality gate) được kiểm soát hoàn toàn thông qua các lệnh `pnpm` local trước khi release.

## 2. Kiến trúc

Đây là modular monolith:

| Khu vực           | Trách nhiệm                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app/`        | Next pages/layouts, API route handlers, server actions, metadata, PWA/service worker                     |
| `src/components/` | UI nghiệp vụ và Radix/Tailwind primitives                                                                |
| `src/lib/`        | Env, DB, Clerk bridge, authz, crypto, error, request, money, Redis, logging                              |
| `src/modules/`    | Domain services: connectors, links, conversions, ledger, payout, identity, jobs, evidence, notifications |
| `prisma/`         | Schema nguồn sự thật, migration, DB constraints/triggers, seed                                           |
| `tests/`          | Integration test có DB và Playwright E2E                                                                 |
| `docs/`           | BRD/TDD, nghiên cứu/API evidence, threat model, production runbooks                                      |

Ranh giới phụ thuộc mong muốn:

1. `app` gọi `modules`/`lib`.
2. `modules` dùng `lib`, Prisma types/client và connector contracts.
3. Pure rules/state machines không phụ thuộc HTTP/UI.
4. UI không được import server secret, Prisma client hoặc bank plaintext.

## 3. Nguồn sự thật và bất biến bắt buộc

### Tài chính

- PostgreSQL là nguồn sự thật tài chính.
- `WalletProjection` chỉ là projection nhanh; ledger mới là sổ kế toán.
- Tiền persisted dùng `bigint` VND. Tỷ lệ dùng basis points `0..10000`.
- Không dùng floating point cho ledger, wallet, commission hoặc payout.
- Journal chỉ chứa line dương và tổng debit phải bằng tổng credit.
- `LedgerTransaction` và `LedgerEntry` append-only bằng database trigger.
- Sửa conversion phải tạo revision và compensating journal; không sửa lịch sử ledger.
- Mọi posting/submission cần idempotency key ổn định.
- Thao tác cạnh tranh trên wallet/payout phải nằm trong transaction, dùng lock và isolation phù hợp.
- Tenant owner nhận hoa hồng vào tài khoản Affiliate riêng; nền tảng chỉ thu phí gói, không thu phần trăm hoa hồng tenant.
- Cashback tenant = `round_down((netCommissionVnd - round_down(netCommissionVnd × 10%)) × memberShareBps)`.
- Conversion tenant sau cutover không post vào `WalletProjection` hoặc payout core. Khi tenant finance được bật, conversion `VALIDATED` tạo `TenantCashbackObligation` deterministic và được cấp vốn từ `TenantTreasuryProjection` sang `TenantMemberWalletProjection`. Lịch sử `tenantPaidAt` trước cutover vẫn là external settlement có audit và không được chuyển đổi hồi tố.
- Mọi journal tenant phải balanced, line dương, idempotent và cập nhật projection/obligation trong cùng Serializable transaction; correction luôn dùng compensating journal hoặc recovery, không sửa ledger cũ và không cho ví âm.

### Conversion và evidence

- Natural identity là `source + affiliateAccount + externalOrderId + externalItemKey`.
- Nguồn evidence: `AUTHORITATIVE` > `PROVISIONAL_AUTHORITATIVE` > `AUXILIARY`.
- Nguồn mạnh hơn có thể thay nguồn yếu hơn; chênh lệch tiền/trạng thái phải được reconciliation.
- Raw payload luôn được SHA-256; production lưu S3 Object Lock.
- Không được coi private browser endpoint/cookie scraping là provider contract production.
- Validation và settlement là hai state machine độc lập. Hết hold 4–60 ngày chỉ chuyển conversion
  sang `VALIDATED`, không release wallet.
- Settlement evidence đã tác động tài chính là append-only. Correction sau release tạo compensating
  journal.

### Payout

- Payout phải vượt qua cả env credentials và DB flag `payout.enabled`.
- Beta: tối thiểu 100.000 VND; tối đa 500.000 VND/ticket và user/ngày.
- Bank beneficiary mới/đổi chịu security hold theo `BENEFICIARY_HOLD_HOURS`; payout không tạo hold riêng.
- Creator, reviewer và approver phải tách biệt theo rule hiện tại.
- Finance action cần passkey dùng trong 10 phút gần nhất.
- Timeout/provider ambiguity chuyển `UNKNOWN`; reconcile trước, không tự gửi tiền lần hai.

### Bảo mật và privacy

- Không log token, secret, cookie, authorization, bank plaintext hoặc cipher payload.
- Bank account/name được AES-256-GCM bằng `BANK_DATA_ENCRYPTION_KEY_V1`.
- Outbound link chỉ dùng HTTPS và phải qua URL policy/allowlist.
- API browser mutation phải kiểm tra origin, giới hạn body và trả `AppError` an toàn.
- Admin cần role, email allowlist, Clerk session mới, Google connection đã verify và Redis cache hợp lệ.
- Service worker không cache `/api`, auth, `/admin`, `/app`, `/tenant`, `/<slug>/app` hoặc `/go`.
- Giấy tờ định danh cá nhân không thuộc source tree và không được app lưu.

## 4. Luồng nghiệp vụ chính

### Link → click → redirect

1. `POST /api/v1/links` yêu cầu user đăng nhập.
2. `createAffiliateLink` xác định platform/campaign/merchant, kiểm tra kill switch và URL.
3. Rate được resolve theo thứ tự user-campaign → user-merchant → user-global → system/merchant fallback.
4. Connector tạo provider URL có click token/SubID.
5. `AffiliateClick` và `AttributionSnapshot` được persist.
6. `/go/[clickToken]` hash IP/user-agent, đánh dấu click và redirect 302 đến URL HTTPS đã lưu.

### Provider → conversion → cashback

1. Vercel Cron/QStash gọi internal job đã ký.
2. Connector poll theo cửa sổ overlap và cursor.
3. Raw payload được hash/lưu evidence.
4. `ingestConversion` dedupe natural identity và hợp nhất nhiều nguồn.
5. Conversion hợp lệ ghi provider receivable, user pending liability và platform revenue.
6. `deliveredAt + holdDays` chỉ kết thúc validation; job hết hold chuyển sang `VALIDATED` khi
   authority/health còn hợp lệ và không thay đổi wallet.
7. Shopee cần Hóa đơn đối soát chi tiết đã đóng; Lazada/AccessTrade cần Finance settlement evidence.
8. Settlement exact-match, idempotent mới chuyển pending → available trong cùng transaction
   journal/wallet. Correction dùng compensating journal.

### Withdrawal → payOS

1. User lưu beneficiary; dữ liệu mã hóa và áp dụng security hold cấu hình tập trung.
2. Tạo payout lock wallet, kiểm tra số dư/limit/system budget rồi chuyển available → reserved.
3. Finance reviewer và approver xử lý độc lập, có recent passkey.
4. Submission dùng một payOS idempotency key cho attempt.
5. `PAID` chuyển reserved liability → cash; `FAILED` trả reserved → available.
6. `UNKNOWN` chỉ được giải quyết bằng reconciliation.

### Clerk identity

1. Clerk xử lý sign-in/sign-up/session/invitation.
2. App reconcile Clerk user sang local `User`, `RoleAssignment`, `WalletProjection`.
3. Invite-only yêu cầu local invitation hợp lệ.
4. Clerk webhook dùng Svix signature + idempotency record.
5. Account deletion kiểm tra financial blockers trước khi gọi Clerk delete.

### Tenant/KOC SaaS Core v2

1. Hệ thống có đúng một tenant loại `MASTER` do `MASTER_TENANT_ID` xác định. `OWNER` là owner master; `MASTER_MEMBER` là member master; `TENANT_MASTER` là master member đồng thời sở hữu tối đa một tenant `STANDARD`; `TENANT_USER` là member của đúng một tenant standard. Persona được suy ra từ database, không persist role dẫn xuất.
2. Ownership và membership độc lập. Khi master member tạo tenant, `User.tenantId` vẫn là master; tenant user không được rời tenant để tạo tenant con. Backfill đưa core user và owner tenant standard về master, giữ nguyên member standard và lịch sử finance.
3. Portal được tách shell/navigation/data: `/admin` cho Owner/staff, `/app` cho cashback cá nhân của master member, `/tenant` cho Tenant Master, `/<slug>/app` cho Tenant User; `/<slug>` là landing public. Custom domain `/app` resolve tenant server-side. Route/API không tin slug, tenant ID, owner ID hoặc wallet ID do client gửi.
4. `/app` luôn dùng Affiliate ID/rate master; `/<slug>/app` dùng Affiliate ID/rate của tenant còn hiệu lực; `/tenant` chỉ tạo tenant-channel link khi chức năng chỉ rõ. Packet Shopee SubID v2 vẫn là `["affweb", clickToken alphanumeric, source, mode, "v2"]` và không chứa PII.
5. Tài chính tenant tách khỏi core bằng `TenantTreasuryProjection`, `TenantMemberWalletProjection`, `TenantCashbackObligation`, `TenantFundingOrder`, `TenantPayout` và `TenantPayoutAttempt`. Top-up PayOS chỉ credit khi signature/order/payment link/amount/currency khớp; funding sau đó phân bổ FIFO ổn định theo `createdAt,id`.
6. Hệ thống tài chính phân cấp Owner → Tenant Master → Tenant User hoạt động trên hai trục lifecycle độc lập: `ApprovalStatus` (`PENDING → APPROVED | REJECTED | CANCELLED`) và `SettlementStatus` (`NOT_STARTED → PROCESSING → PAID | FAILED | UNKNOWN`). `TenantPayout.status` được duy trì như mirror đọc tương thích cho legacy consumers.
7. Mọi thao tác tài chính đi qua `FinancialActorContext` xác định actor role (`OWNER`, `TENANT_MASTER`, `TENANT_USER`, `SYSTEM_WORKER`) và `targetTenantId`. Dữ liệu thụ hưởng ngân hàng được snapshot mã hóa. Thao tác duyệt không trực tiếp gọi PayOS; `executeApprovedPayosPayout` chạy inline sau khi approval transaction commit, khởi tạo `TenantPayoutExecutionIntent` duy nhất và `TenantPayoutAttempt` (SUBMIT) đơn lẻ.
8. Platform self-approval áp dụng hạn mức `PLATFORM_SELF_APPROVAL_LIMIT_VND` (mặc định 0 VND fail-closed). Trường hợp chuyển khoản thủ công có two-eye guard `MANUAL_NO_SEND_SELF_CONFIRM_LIMIT_VND`. Route `/external-payment` trả HTTP 410 Gone vĩnh viễn. Các QStash recurring schedules 5-15 phút bị loại bỏ, thay bằng một Vercel daily safety sweep cron duy nhất (`/api/internal/cron/finance-safety-sweep`).
9. Mọi gate tenant mặc định off: `TENANT_FINANCE_ENABLED`, `TENANT_TOPUP_ENABLED`, `TENANT_AUTO_PAYOUT_ENABLED`, `PAYOS_PAYOUT_ENABLED`, global DB flags tương ứng và per-tenant flags. SaaS billing, tenant funding và tenant payout dùng chung duy nhất một bộ credentials PayOS (`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`).
10. Zalo dùng một bot trung tâm. Group binding resolve tenant server-side; user binding dùng sender ID provider đã hash/mã hóa và one-time token có expiry. Link cashback yêu cầu binding đúng tenant. Lệnh wallet/payout trong group chỉ trả portal confirmation link, không hiển thị số dư/ngân hàng và không reserve/approve/submit payout.

Các release blocker còn mở:

- Shopee Orders parser đã chốt theo hai fixture provider 47 cột Việt/Anh đã redacted. Schema drift,
  SubID malformed, duplicate natural key hoặc unmatched click khóa batch; đơn hủy là non-payable
  và không post ledger/wallet. Import chỉ cập nhật conversion/validation/evidence, không settle.
- Shopee reconciliation endpoint vẫn chủ động fail-closed dù flag bị bật cho tới khi có export chi
  tiết “Xem chi tiết/Bảng kê thanh toán” thật đã redacted, AFF ID/account identity và exact line
  tie-out. Không dùng ảnh chụp, tổng invoice hoặc Payment History để release.
- PayOS billing và Zalo cần credential sandbox/staging thật để chạy contract smoke. Return/cancel URL không thay đổi subscription.
- Authenticated Chromium E2E cần Clerk staging storage state, disposable DB fixtures và provider stubs/credentials; repository hiện chỉ chứng minh unit/build và public/auth-boundary E2E.
- Migration baseline tenant/SaaS/Zalo, expand Core v1 và additive tenant finance/portal v2 đã được thêm, nhưng vẫn phải chứng minh `prisma migrate deploy` trên PostgreSQL disposable trống và clone trạng thái hiện tại trước deploy. Script backfill master tenant không được chạy trước khi xác nhận `MASTER_TENANT_ID`, migration lineage và database target.
- Migration hiện là expand-only: cột legacy `planId`, `isTrial`, invoice `amount` và Zalo scaffold chưa bị xóa. Contract migration chỉ được tạo sau dual-read/backfill consistency sạch.
- Lazada/AccessTrade code path dùng contract chính thức và mặc định tắt. Chỉ active sau credential
  preflight, identity match, fixture/round-trip và controlled staging smoke. AccessTrade credential
  từng lộ phải được rotate.

## 5. Model dữ liệu theo domain

- Identity/tenant: `User`, `RoleAssignment`, `AdminPasskey`, `IdentityInvitation`, `AccountDeletionRequest`, `Tenant`, `SubscriptionPlan`, `SaaSInvoice`, `TenantSubscriptionAdjustment`, `TenantConversionImport`, `ZaloGroupBinding`, `ZaloBindingCode`; các bảng Auth.js cũ còn giữ cho rollback.
- Catalog/attribution: `Merchant`, `Campaign`, `AffiliateAccount`, `AffiliateClick`, `AttributionSnapshot`, `OfferSnapshot`; user/click/conversion có tenant scoping field.
- Connector/evidence: `ConnectorConfig`, `ConnectorCursor`, `ConnectorHealth`, `SyncRun`,
  `RawEvidence`, `ProviderCredential`.
- Conversion/reconciliation: `ExternalConversionIdentity`, `Conversion`, `ConversionItem`,
  `ConversionRevision`, `ReconciliationCase`, `RiskHold`, `SettlementEvidence`, `SettlementBatch`,
  `SettlementLine`.
- Rate/finance: `CommissionRule`, `CommissionRuleVersion`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, `WalletProjection`.
- Payout: `BankBeneficiary`, `BeneficiaryChange`, `PayoutTicket`, `PayoutApproval`, `PayoutAttempt`, `BalanceAdjustment`.
- Tenant finance: `TenantTreasuryProjection`, `TenantMemberWalletProjection`, `TenantCashbackObligation`, `TenantFundingOrder`, `TenantPayout`, `TenantPayoutAttempt`.
- Messaging/operations: `Notification`, `NotificationDelivery`, `PushSubscription`, `OutboxEvent`, `IdempotencyRecord`, `FeatureFlag`, `AuditLog`.

Chi tiết field, relation, enum, line number và purpose nằm trong `project_map.json`.

## 6. Môi trường local đã thiết lập

### Bắt buộc

- Git.
- Node.js 22.x.
- pnpm đúng `10.5.2`.

Node `22.23.1` đã được cài tại `C:\Program Files\nodejs`, nhưng shell hiện tại vẫn ưu tiên symlink NVM `C:\nvm4w\nodejs` đang trỏ tới Node `20.14.0`. Trước khi chạy dự án trong VS Code cần kiểm tra `where.exe node`/`node -v` và bảo đảm terminal thật sự resolve Node 22. Dự án yêu cầu pnpm `10.5.2`.

Không bắt buộc cài PostgreSQL, Docker, Redis app hoặc Vercel CLI nếu dùng Neon/Upstash remote trong file env đã cung cấp.

Playwright E2E cần browser binaries:

```powershell
pnpm exec playwright install chromium
```

Chỉ cài cả năm browser khi cần chạy toàn bộ matrix:

```powershell
pnpm exec playwright install
```

### `.env`

- File `C:\Users\Admin\Downloads\.env.local` đã được copy nguyên byte vào root thành `.env`.
- File `.env` được `.gitignore` chặn; không commit, paste hoặc đưa giá trị vào context/map/log.
- App local đã dùng `NODE_ENV=development` và `APP_BASE_URL=http://localhost:3000`.
- Neon có pooled `DATABASE_URL` và direct URL cho migration.
- Upstash runtime có thể dùng `KV_REST_API_URL/TOKEN`; `src/lib/redis.ts` hỗ trợ fallback này.
- Clerk webhook secret và Sentry DSN đang trống; local page/API thường vẫn chạy, nhưng webhook Clerk và Sentry không hoạt động cho đến khi cấu hình.
- Không có code/config TypeScript nào được sửa để nạp env. Next.js tự đọc `.env`; Prisma config hiện có `dotenv/config` nên cũng đọc `.env`.

### Cảnh báo database

Database trong file hiện trỏ tới một Neon database tên chung `neondb`. Từ URL không thể chứng minh đây là branch dev/test hay production.

- Có thể chạy app local để debug với DB remote, nhưng các thao tác UI/API có thể ghi trực tiếp vào DB đó.
- Không chạy `db:seed`, migration mới hoặc integration test trước khi xác nhận đây là branch dev riêng.
- Integration test chỉ chạy qua `pnpm test:integration`, bắt buộc `TEST_DATABASE_URL` khác mọi runtime/migration URL và tên database có marker test/ci/tmp/disposable.
- `prisma migrate status` ngày 2026-07-28 xác nhận hai migration cũ đã được ghi nhận và migration `202607280001_tenant_affiliate_member_sharing` đang pending. Read-only diff xác nhận DB đã có tenant tables/fields nền dù repository không có migration tạo baseline tenant; phải xử lý migration lineage trước khi dựng database mới từ đầu.
- Không chạy `db:deploy` cho đến khi xác nhận Neon hiện tại là branch dev/staging phù hợp và đã review dữ liệu owner trùng lặp/constraint compatibility.
- Không chạy `tenant:configure-master` nếu migration tenant finance chưa deploy hoặc database chưa được chứng minh disposable/staging; script yêu cầu xác nhận backfill exact-match và không phải công cụ runtime.
- An toàn nhất: tạo Neon branch/database riêng cho mỗi developer/test, sau đó đặt `DATABASE_URL` và `DIRECT_URL` của branch đó trong `.env`.
- Không bao giờ dùng `prisma db push` cho staging/production.

## 7. Cách chạy local

Sau khi cài Node 22 và pnpm 10.5.2:

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm dev
```

Mở `http://localhost:3000`.

Kiểm tra kết nối/migration theo hướng không thay đổi schema:

```powershell
pnpm exec prisma migrate status
```

Không chạy `pnpm db:deploy` hoặc `pnpm db:seed` trên Neon hiện tại trước khi xử lý migration baseline và drift identity. `pnpm db:migrate` chỉ dùng khi chủ động tạo migration mới trên database dev riêng.

## 8. Kiểm định trước khi push

Nhanh, không cần DB test:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm test:unit
pnpm build
```

`pnpm test:run` là alias an toàn của unit suite. Integration DB chạy riêng:

```powershell
TEST_DATABASE_URL=postgresql://.../affweb_test pnpm test:integration
```

Database phải là disposable; global setup canonicalize pooled/unpooled URL rồi chạy
`prisma migrate deploy` đúng vào `TEST_DATABASE_URL`. Setup từ chối URL trùng runtime/migration và
không tạo DDL ngoài migrations.

E2E public:

```powershell
pnpm test:e2e --project=chromium
```

Full:

```powershell
pnpm verify
pnpm test:e2e
```

Production env readiness:

```powershell
pnpm env:check
```

Lệnh này được phép fail ở local khi các integration production như Clerk webhook, S3, Sentry hoặc payOS chưa đầy đủ.

## 9. Vercel và release

- Repository không sử dụng GitHub Actions (`.github/workflows`). Mọi thao tác quality gate (lint, typecheck, DB validation, test, build) được kiểm tra local qua bộ lệnh `pnpm` trước khi deploy Vercel.
- Vercel đọc env theo từng environment; `.env` local không được push.
- Runtime dùng pooled URL; migration dùng direct/unpooled URL.
- Production release phải theo `docs/operations/production-runbook.md`.
- Trước tiền thật: kiểm tra Clerk cutover, QStash, evidence storage, restore drill, kill switches, payout budget và smoke test.

## 10. Tài liệu nên đọc theo tác vụ

1. `README.md` — entry point.
2. `context.md` — kiến trúc vận hành hiện tại.
3. `project_map.json` — tra file/hàm/model cụ thể.
4. `docs/tdd/cashback_affiliate_platform_tdd_vi.md` — quyết định kỹ thuật.
5. `docs/brd/cashback_affiliate_platform_brd_vi.md` — yêu cầu nghiệp vụ.
6. `docs/security/threat-model.md` — trust boundaries và controls.
7. `docs/operations/*` — chỉ đọc phần liên quan khi đụng production/identity/incident/restore/Lazada.

## 11. Duy trì “bộ não thứ hai”

Không có generator hoặc package script mới được thêm vào dự án. Khi source thay đổi, cập nhật `project_map.json` trong cùng tác vụ bằng công cụ ngoài repo hoặc chỉnh có kiểm soát, rồi kiểm tra:

```powershell
node -e "JSON.parse(require('node:fs').readFileSync('project_map.json','utf8')); console.log('project_map.json valid')"
git diff -- context.md AGENTS.md project_map.json
```

Cập nhật thủ công `context.md` khi thay đổi kiến trúc, business invariant, service, env, command, deployment hoặc luồng nghiệp vụ. Không đưa secret hoặc dữ liệu production vào bất kỳ file context nào.

## 12. Những điểm cần nhớ khi phát triển tiếp

- Shopee Open API là adapter gated, không phải connector mặc định cho Shopee Việt Nam.
- Cashback release, Shopee Orders, Lazada, AccessTrade, provider credential, ShopeeFood cashback và
  payout đều có kill switch độc lập. Shopee reconciliation còn có hard contract gate.
- Production build/test được thiết kế để không cần credential thật; tính năng tiền thật fail-closed.
- Không thêm endpoint/cookie AddLiveTag mới. Link cashback chính luôn đi qua
  `createAffiliateLink` để có attribution; connector/catalog AddLiveTag hiện có vẫn được giữ.
- Tenant/KOC Core v1 có principal/link policy, quota, external settlement, plan catalog, PayOS
  billing, admin và Zalo central bot. Shopee Orders import khả dụng sau flag; Shopee reconciliation
  vẫn fail-closed do thiếu file chi tiết hóa đơn thật đã redacted.
- Khi thêm provider mới: định nghĩa authority, natural key, URL policy, Zod response schema, timeout, pagination/overlap, evidence, health check và fixture test trước khi active.
