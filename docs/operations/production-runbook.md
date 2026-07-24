# Production runbook

## 1. Điều kiện phát hành

Không bật tiền thật nếu còn bất kỳ điều kiện nào sau:

- `pnpm env:check`, migration, build, integration, E2E hoặc Lighthouse thất bại;
- ledger invariant khác 0;
- chưa restore thử backup;
- chưa có Terms, Privacy, Cashback Policy và quy trình khiếu nại được rà soát pháp lý/kế toán/thuế;
- chưa có hai admin finance khác nhau với passkey;
- chưa hoàn tất domain, Google callback, SPF/DKIM/DMARC, AddLiveTag, AccessTrade hoặc payOS production credential.

Lazada token Pending không chặn go-live; giữ `LAZADA_MODE=credential_ready` và kill switch tắt.

## 2. Provision hai môi trường

Tạo hai Vercel project độc lập: `affweb-staging` và `affweb-production`. Mỗi project có Neon database/branch, Upstash Redis, QStash, S3 bucket Object Lock, OAuth callback, Resend domain, Sentry project và provider credential riêng.

Neon:

1. Bật PITR 30 ngày.
2. Dùng pooled URL cho `DATABASE_URL`.
3. Dùng direct URL cho `DIRECT_URL`.
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

## 3. Environment

Nạp toàn bộ key trong `.env.example` theo đúng target Development/Preview/Production. Không đặt secret dưới `NEXT_PUBLIC_`.

```bash
NODE_ENV=production pnpm env:check
```

AddLiveTag cookie chỉ cấu hình bằng tài khoản affiliate chuyên dụng trên portal AddLiveTag. Không gửi cookie vào app, source code, Vercel env hay ticket hỗ trợ.

Lazada để:

```text
LAZADA_MODE=credential_ready
LAZADA_LITE_APP_KEY=
LAZADA_LITE_APP_SECRET=
LAZADA_USER_TOKEN=
```

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
connector.shopee_food_cashback=false
```

## 5. QStash

Sau khi domain production trả `/api/health/ready` thành công:

```bash
pnpm jobs:setup
```

Script upsert queue concurrency 1 và các schedule:

- health/payOS reconciliation: 5 phút;
- AddLiveTag/Shopee: 10 phút;
- AccessTrade/Lazada: 15 phút;
- notification/release: mỗi giờ hoặc ngắn hơn;
- backfill 90 ngày: 02:00 giờ Việt Nam (`19:00 UTC`);
- ledger invariant: 03:00 giờ Việt Nam (`20:00 UTC`);
- evidence integrity: Chủ nhật 04:00 giờ Việt Nam (`21:00 UTC` thứ Bảy).

QStash request và failure callback bắt buộc signature. Body/header bị redact; exhausted retry gọi
`/api/internal/qstash-failure`, chỉ lưu SHA-256/kích thước payload và gửi cảnh báo in-app cho admin,
không lưu payload callback.

## 6. Release

1. Merge khi CI xanh và review hoàn tất.
2. Chạy commit đó trên staging, migration + seed + full E2E.
3. Chạy live provider smoke ở shadow mode.
4. Tạo Neon checkpoint/backup.
5. Chạy GitHub workflow `Release production` với SHA bất biến.
6. Production protected environment cần approver thủ công.
7. Chạy:

```bash
APP_BASE_URL=https://your-domain.example pnpm smoke:production
```

8. Theo dõi ít nhất 60 phút: error, p95, DB pool, connector lag, raw evidence, ledger mismatch và payout `UNKNOWN`.

## 7. Beta tiền thật

1. Internal: shadow sync 7 ngày; payout/release tắt.
2. 10 user: mở release và payout sau drill, giới hạn vận hành 200.000 VND/user/ngày.
3. 50 user: nâng 500.000 VND sau 7 ngày reconciliation sạch.
4. 100 user: chỉ sau 14 ngày không mismatch nghiêm trọng.
5. Public registration là release riêng.

Mỗi lần mở flag phải ghi ticket vận hành, người thực hiện, thời gian, invariant trước/sau và kế hoạch quay lại.
