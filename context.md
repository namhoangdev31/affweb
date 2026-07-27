# Project Context — Hoàn Tiền (`affweb`)

Tài liệu này là bản đồ tư duy cấp cao của dự án. Đọc cùng `AGENTS.md` trước khi sửa code; dùng `project_map.json` khi cần tra từng file, route, hàm, method, import/export hoặc model Prisma.

## 1. Mục tiêu sản phẩm

`affweb` là web app/PWA affiliate cashback tại Việt Nam. Người dùng tạo link affiliate, đi qua redirect nội bộ có attribution và hệ thống đồng bộ conversion từ nhiều nguồn. Flow nền tảng dùng ledger/wallet/payOS; flow member thuộc tenant dùng Affiliate ID của tenant owner, chỉ tính/ghi nhận khoản chia và để owner thanh toán bên ngoài hệ thống.

Các nền tảng hiện có:

- Shopee Marketplace: direct `an_redir`; có adapter Shopee Affiliate Open API nhưng bị khóa bằng cấu hình.
- ShopeeFood: direct `an_redir` với `source=food`; cashback có kill switch riêng.
- AddLiveTag: catalog, click và conversion cho Shopee/ShopeeFood.
- AccessTrade: product link, offers và transaction sync.
- Lazada: signing/link/product/conversion contract; mặc định chưa active.

Stack chính:

- Next.js 16 App Router, React 19, TypeScript strict.
- PostgreSQL/Neon, Prisma 7 và `@prisma/adapter-pg`.
- Clerk cho identity; role và trạng thái nghiệp vụ nằm trong PostgreSQL.
- Upstash Redis + QStash cho cache/rate limit/job.
- payOS cho payout; Resend cho email; Web Push cho PWA.
- AWS S3 Object Lock cho raw evidence production; Sentry cho observability.
- Tenant/KOC SaaS mới dùng path/slug, gói dùng thử, PayOS subscription invoice và một Zalo Bot trung tâm; phần này đang ở trạng thái triển khai chưa khép kín end-to-end.
- Vercel là runtime/deployment target. Workflow GitHub Actions đã bị xóa khỏi repository trong code vừa pull; kiểm định hiện phải được chạy chủ động hoặc do pipeline ngoài repository đảm nhiệm.

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
- Conversion tenant không được post vào ledger/wallet/payout nền tảng. `tenantPaidAt` chỉ là xác nhận owner đã chi trả bên ngoài và phải có audit.

### Conversion và evidence

- Natural identity là `source + affiliateAccount + externalOrderId + externalItemKey`.
- Nguồn evidence: `AUTHORITATIVE` > `PROVISIONAL_AUTHORITATIVE` > `AUXILIARY`.
- Nguồn mạnh hơn có thể thay nguồn yếu hơn; chênh lệch tiền/trạng thái phải được reconciliation.
- Raw payload luôn được SHA-256; production lưu S3 Object Lock.
- Không được coi private browser endpoint/cookie scraping là provider contract production.

### Payout

- Payout phải vượt qua cả env credentials và DB flag `payout.enabled`.
- Beta: tối thiểu 100.000 VND; tối đa 500.000 VND/ticket và user/ngày.
- Bank beneficiary mới/đổi bị hold 72 giờ.
- Creator, reviewer và approver phải tách biệt theo rule hiện tại.
- Finance action cần passkey dùng trong 10 phút gần nhất.
- Timeout/provider ambiguity chuyển `UNKNOWN`; reconcile trước, không tự gửi tiền lần hai.

### Bảo mật và privacy

- Không log token, secret, cookie, authorization, bank plaintext hoặc cipher payload.
- Bank account/name được AES-256-GCM bằng `BANK_DATA_ENCRYPTION_KEY_V1`.
- Outbound link chỉ dùng HTTPS và phải qua URL policy/allowlist.
- API browser mutation phải kiểm tra origin, giới hạn body và trả `AppError` an toàn.
- Admin cần role, email allowlist, Clerk session mới, Google connection đã verify và Redis cache hợp lệ.
- Service worker không cache `/api`, auth, `/app`, `/admin`, `/go`.
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
6. Conversion validated tạo safety hold.
7. Job release chỉ chạy khi kill switch bật, connector còn fresh và không vượt beta daily limit.
8. Release chuyển pending → available trong cả ledger và wallet.

### Withdrawal → payOS

1. User lưu beneficiary; dữ liệu mã hóa và hold 72 giờ.
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

### Tenant/KOC SaaS hiện tại

1. Mọi tài khoản là member nền tảng. Một member có thể mua gói để sở hữu tối đa một `Tenant`; `Tenant.ownerUserId` là admin nhóm, không phải role quản trị hệ thống.
2. Onboarding bắt buộc Shopee Affiliate ID và tỷ lệ hoàn member từ 1–100%; tenant bắt đầu trial 14 ngày và owner được gắn `tenantId`.
3. Public channel dùng `/<slug>`; proxy nhận diện slug và lưu cookie `aff_tenant_slug` để Clerk reconciliation có thể gắn user mới vào tenant.
4. Owner tạo link mua cá nhân luôn đi theo Affiliate ID/rate nền tảng để tránh tự mua bằng Affiliate ID của chính mình. Member tenant chỉ tạo link Shopee bằng Affiliate ID của owner khi gói còn hiệu lực và cấu hình đầy đủ; không fallback âm thầm về ID nền tảng.
5. Packet SubID là `[clickToken, userId, tenantId | "main", "hoantien"]`; `AffiliateClick.tenantId`, product snapshot, rate và thuế được persist tại link time.
6. Conversion tenant propagate `tenantId`, trừ 10% thuế ước tính rồi chia theo immutable `shareBps`. Không tạo risk hold, ledger posting hay wallet projection của nền tảng cho khoản này.
7. Tenant owner xem các conversion của nhóm tại `/app/conversions?scope=all` và chỉ được đánh dấu đơn `VALIDATED` là đã chi trả ngoài hệ thống; thao tác được audit và không có chức năng hoàn tác tùy tiện.
8. Subscription tạo `SaaSInvoice`; PayOS webhook hợp lệ chuyển invoice sang `PAID` và gia hạn tenant 30/365 ngày.
9. Zalo group dự kiến bind với tenant bằng `/link <slug>`, sau đó bot nhận URL mua sắm và trả link `/go/<clickToken>`.

Phần tenant chưa được coi là production-ready:

- Quota/connector entitlement mới chủ yếu là helper; chưa được enforce trong flow tạo link/member.
- Settings Affiliate và checkout đã kiểm tra owner/origin/schema; các SaaS/Zalo API còn lại chưa áp dụng đầy đủ auth, ownership, origin, schema validation và webhook verification.
- Zalo click hiện lưu `outboundUrl` trỏ lại chính `/go/<clickToken>`, nên chưa tạo provider tracking URL thật.
- Shopee công khai cách xuất báo cáo conversion CSV nhưng không công bố schema cột ổn định. Chưa xây importer tenant cho đến khi có file mẫu thật; Affiliate ID đơn lẻ không cho phép tự động đọc đơn/hoa hồng.
- Database hiện có tenant tables/fields từ thay đổi ngoài migration lineage của repository. Migration mới chỉ thêm affiliate sharing/product snapshot/tax/payment marker trên baseline DB đang có; fresh database chưa thể tái tạo toàn bộ tenant schema chỉ từ các migration trong repo.

## 5. Model dữ liệu theo domain

- Identity/tenant: `User`, `RoleAssignment`, `AdminPasskey`, `IdentityInvitation`, `AccountDeletionRequest`, `Tenant`, `SubscriptionPlan`, `SaaSInvoice`, `ZaloGroupBinding`; các bảng Auth.js cũ còn giữ cho rollback.
- Catalog/attribution: `Merchant`, `Campaign`, `AffiliateAccount`, `AffiliateClick`, `AttributionSnapshot`, `OfferSnapshot`; user/click/conversion có tenant scoping field.
- Connector/evidence: `ConnectorConfig`, `ConnectorCursor`, `ConnectorHealth`, `SyncRun`, `RawEvidence`.
- Conversion/reconciliation: `ExternalConversionIdentity`, `Conversion`, `ConversionItem`, `ConversionRevision`, `ReconciliationCase`, `RiskHold`.
- Rate/finance: `CommissionRule`, `CommissionRuleVersion`, `LedgerAccount`, `LedgerTransaction`, `LedgerEntry`, `WalletProjection`.
- Payout: `BankBeneficiary`, `BeneficiaryChange`, `PayoutTicket`, `PayoutApproval`, `PayoutAttempt`, `BalanceAdjustment`.
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
- Integration test tự chạy khi process có `DATABASE_URL`; test tạo dữ liệu và chưa cleanup.
- `prisma migrate status` ngày 2026-07-28 xác nhận hai migration cũ đã được ghi nhận và migration `202607280001_tenant_affiliate_member_sharing` đang pending. Read-only diff xác nhận DB đã có tenant tables/fields nền dù repository không có migration tạo baseline tenant; phải xử lý migration lineage trước khi dựng database mới từ đầu.
- Không chạy `db:deploy` cho đến khi xác nhận Neon hiện tại là branch dev/staging phù hợp và đã review dữ liệu owner trùng lặp/constraint compatibility.
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
pnpm exec vitest run src
pnpm build
```

`pnpm test:run` còn bao gồm `tests/integration` và sẽ dùng `DATABASE_URL` trong `.env`; chỉ chạy full test trên database disposable/isolated.

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

- Repository hiện không còn `.github/workflows/ci.yml`; push `main` không được code trong repository này chứng minh là sẽ chạy secret scan, lint, typecheck, integration, build hay E2E trước deploy.
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
- Cashback release, Lazada, ShopeeFood cashback và payout đều có kill switch độc lập.
- Production build/test được thiết kế để không cần credential thật; tính năng tiền thật fail-closed.
- Public product lookup có thể gọi AddLiveTag; link cashback chính vẫn phải đi qua `createAffiliateLink` để có attribution.
- Tenant/KOC là feature đang phát triển: link routing, snapshot, phép tính sau thuế và external payment marker đã có; importer báo cáo Shopee, Zalo flow, quota đầy đủ và migration baseline tenant vẫn chưa hoàn thiện.
- Khi thêm provider mới: định nghĩa authority, natural key, URL policy, Zod response schema, timeout, pagination/overlap, evidence, health check và fixture test trước khi active.
