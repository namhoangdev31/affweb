# External CI contract

Dự án không sử dụng GitHub Actions. Quy trình kiểm soát chất lượng (Quality Gate) được thực thi local bằng Node 22.x, pnpm 10.5.2 qua `pnpm verify` và `pnpm test:integration`.

## Pull request / pre-merge

1. Secret scan toàn history/diff bằng Gitleaks hoặc công cụ tương đương; output phải redacted.
2. Chạy `pnpm verify`.
3. Chạy `pnpm audit --prod`; không chấp nhận advisory production.
4. Lưu log format/lint/typecheck/test/build/audit theo commit SHA.

## Integration

1. Tạo PostgreSQL disposable có database name chứa `test`, `ci`, `tmp` hoặc `disposable`.
2. Truyền pooled URL qua `TEST_DATABASE_URL`, direct URL qua `TEST_DIRECT_URL`, bật
   `ALLOW_TEST_DATABASE_RESET=true` và allowlist hostname. Không inject production URL vào process.
3. Chạy `pnpm test:integration`; global setup tự chạy `prisma migrate deploy`.
4. Hủy database/branch sau job; giữ test report, không giữ payload/PII.

## E2E và release

1. Chạy Chromium public/auth boundary với provider stub.
2. Authenticated suite dùng Clerk staging storage state và fixture database disposable.
3. Trước release, chạy migration trên database staging trống và clone staging hiện tại, provider
   shadow smoke, restore drill và `pnpm smoke:production`.
4. Billing, funding và payout dùng chung duy nhất bộ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
   `PAYOS_CHECKSUM_KEY`; capability vẫn có kill switch riêng. Shopee reconciliation luôn off tới khi
   fixture hóa đơn thật và exact tie-out được review.
