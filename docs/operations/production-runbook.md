# Production runbook

## 1. Điều kiện phát hành

Không bật tiền thật nếu còn bất kỳ điều kiện nào sau:

- `pnpm env:check`, migration, build, integration, E2E hoặc Lighthouse thất bại;
- ledger invariant khác 0;
- chưa restore thử backup;
- chưa có Terms, Privacy, Cashback Policy và quy trình khiếu nại được rà soát pháp lý/kế toán/thuế;
- chưa có hai admin finance khác nhau với passkey;
- chưa hoàn tất Clerk production instance/domain/webhook, SPF/DKIM/DMARC, provider contract/credential thực sự được sử dụng hoặc PayOS production credential;
- chưa xác nhận SubID v2 round-trip trên Click/Conversion report staging nếu định bật import;
- chưa có file chi tiết Hóa đơn đối soát thật đã redacted, account identity và exact line tie-out nếu
  định bật Shopee settlement;
- chưa rotate credential AccessTrade từng bị lộ hoặc chưa preflight credential Lazada/AccessTrade;
- chưa có central Zalo Bot token/webhook secret và encryption key nếu định bật Zalo.

Credential provider chưa sẵn sàng không chặn phần còn lại của go-live; giữ connector account ở
`CREDENTIAL_READY` và DB kill switch tắt.

## 2. Provision hai môi trường

Project đang liên kết là `aff-shop`. Production và Preview phải có Neon branch, Redis, QStash, S3 prefix/bucket, Clerk instance/domain, Resend domain, Sentry project và provider credential tách biệt. Nếu tách project staging riêng sau beta, lặp lại toàn bộ isolation này và không copy production payout key.

Neon:

1. Bật PITR 30 ngày.
2. Dùng pooled URL cho `DATABASE_URL`.
3. Dùng direct URL cho `DIRECT_URL` hoặc `DATABASE_URL_UNPOOLED` chỉ trong Prisma migration. Runtime app chỉ dùng pooled `DATABASE_URL`.
4. Runtime role không được cấp quyền sửa/xóa ledger. Migration đã thêm trigger append-only và deferred balance constraint.

AWS:

1. Bucket phải bật versioning và Object Lock lúc tạo.
2. Tạo KMS key và retention compliance tối thiểu 2555 ngày cho raw evidence.
3. Tạo IAM role trust Vercel OIDC, giới hạn đúng project/environment, bucket prefix và `PutObject`, `HeadObject`.
4. Không tạo AWS access key dài hạn.

Vercel:

1. Node.js 22; Fluid Compute cho job dài.
2. Bảo vệ Preview bằng Vercel Authentication.
3. Production domain HTTPS; giữ HSTS.
4. Tạo WAF/rate-limit cho `/api/v1/links`, auth, payout và admin.
5. Env Preview không được trỏ production database hoặc payout credential.
6. Clerk cài qua Vercel Marketplace. Không tạo thêm Clerk application; Application ID duy nhất là `app_3GxTUr7hRQ5aU7hJX2kz7DWGu6U`.

## 3. Environment

Nạp toàn bộ key trong `.env.example` theo đúng target Development/Preview/Production. Không đặt secret dưới `NEXT_PUBLIC_`.

Thực hiện checklist [Clerk cutover](clerk-cutover.md) trước. Marketplace có thể chỉ đồng bộ Development key cho tới khi Clerk production instance được kích hoạt; không copy `pk_test_`/`sk_test_` sang Production.

```bash
NODE_ENV=production pnpm env:check
```

Giữ nguyên credential/connector AddLiveTag hiện có theo phạm vi đã vận hành; không thêm cookie, tool
endpoint hoặc luồng settlement AddLiveTag mới. Clean Link/Find AFF ID chạy nội bộ trên documented URL
parameters và exact host allowlist.

Lazada để:

```text
LAZADA_MODE=credential_ready
LAZADA_LITE_APP_KEY=
LAZADA_LITE_APP_SECRET=
LAZADA_USER_TOKEN=
```

AccessTrade dùng credential mới sau rotation:

```text
ACCESSTRADE_ENABLED=false
ACCESSTRADE_API_KEY=
ACCESSTRADE_PUBLISHER_ID=
```

Tạo key mã hóa credential provider riêng:

```text
PROVIDER_CREDENTIAL_ENCRYPTION_KEY_V1=
```

Tenant Core v1 khởi đầu fail-closed:

```text
TENANT_IMPORT_ENABLED=false
SAAS_BILLING_ENABLED=false
ZALO_BOT_ENABLED=false
```

DB flags khởi đầu fail-closed:

```text
connector.accesstrade.enabled=false
connector.lazada.enabled=false
provider.credentials.enabled=false
shopee.orders_import.enabled=false
shopee.reconciliation_import.enabled=false
cashback.release.enabled=false
```

Không bật `shopee.reconciliation_import.enabled` trong release này: route vẫn cố ý fail-closed cho
tới khi parser có fixture chi tiết hóa đơn thật đã redacted.

PayOS subscription, tenant funding và payout dùng chung `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
`PAYOS_CHECKSUM_KEY`; từng luồng vẫn có kill switch riêng. Zalo dùng token/secret bot trung tâm và
`ZALO_DATA_ENCRYPTION_KEY_V1`; không lưu các secret này trong `Tenant`.

Không bật route webhook payout cho tới khi payOS xác nhận contract webhook dành riêng cho Payout
trên tài khoản production. Worker polling theo payout ID hoặc `referenceId` là nguồn đối soát mặc
định; webhook thanh toán vào không được tái sử dụng để suy đoán payout.

## 4. Database và seed

Trên staging trước, sau đó production:

```bash
pnpm prisma migrate status
pnpm db:deploy
pnpm db:seed
pnpm prisma migrate status
```

Chỉ dùng expand-contract. Không xóa cột trong cùng release đã ngừng đọc. Rollback app bằng deployment cũ; database dùng forward-fix/PITR, không chạy down migration tự động.

Sau seed, kiểm tra các flags. Production khởi đầu:

```text
registration.invite_only=true
cashback.release.enabled=false
payout.enabled=false
connector.lazada.enabled=false
connector.accesstrade.enabled=false
provider.credentials.enabled=false
shopee.orders_import.enabled=false
shopee.reconciliation_import.enabled=false
connector.shopee_food_cashback=false
```

## 5. QStash

Sau khi domain production trả `/api/health/ready` thành công, chạy kiểm tra cấu hình:

```bash
pnpm jobs:setup
```

Script không tạo recurring queue/schedule. Payout thành công chạy inline sau approval commit. Chỉ
payout/funding cụ thể ở `UNKNOWN` hoặc recovery mới publish chuỗi QStash hữu hạn theo
`FINANCE_RECONCILIATION_DELAYS_SECONDS`. Không publish lại SUBMIT; invocation sau chỉ query provider.
`QSTASH_DAILY_SOFT_LIMIT`/`QSTASH_DAILY_HARD_LIMIT` bảo toàn quota; hết quota giữ reservation và
đưa record vào manual review.

Vercel chỉ có một cron ngày: `/api/internal/cron/finance-safety-sweep`. Cron giới hạn batch, không
gọi PayOS hàng loạt và không thay thế business flow. Health thường ngày được xem on-demand tại
`/admin/finance/health`.

QStash request và failure callback bắt buộc signature. Body/header bị redact; exhausted retry gọi
`/api/internal/qstash-failure`, chỉ lưu SHA-256/kích thước payload và gửi cảnh báo in-app cho admin,
không lưu payload callback.

## 6. Release

1. Merge khi CI xanh và review hoàn tất.
2. Chạy commit đó trên staging, migration + seed + full E2E. Chạy integration riêng với
   `TEST_DATABASE_URL` disposable; test global setup tự deploy migration vào đúng URL này.
3. Chạy live provider smoke ở shadow mode.
4. Tạo Neon checkpoint/backup.
5. Workflow `.github/workflows/quality-gates.yml` phải xanh trên PostgreSQL 16 và Neon test branch;
   Preview/Production chỉ deploy đúng SHA đã vượt gate. Tắt Vercel Git auto-deploy để không vượt CI.
6. Production protected environment cần approver thủ công.
7. Chạy:

```bash
APP_BASE_URL=https://your-domain.example pnpm smoke:production
```

8. Theo dõi ít nhất 60 phút: error, p95, DB pool, connector lag, raw evidence, ledger mismatch và payout `UNKNOWN`.

Production thương mại yêu cầu Vercel Pro hoặc backend hosting tương đương; Hobby không phải runtime
production được hỗ trợ cho affiliate/payment.

## 7. Beta tiền thật

1. Internal: chạy credential preflight và controlled sync; payout/release tắt.
2. 10 user: mở release và payout sau drill, giới hạn vận hành 200.000 VND/user/ngày.
3. 50 user: nâng 500.000 VND sau 7 ngày reconciliation sạch.
4. 100 user: chỉ sau 14 ngày không mismatch nghiêm trọng.
5. Public registration là release riêng.

Mỗi lần mở flag phải ghi ticket vận hành, người thực hiện, thời gian, invariant trước/sau và kế hoạch quay lại.
