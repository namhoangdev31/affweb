# External CI contract

Repository không chứa GitHub Actions. Pipeline ngoài repository phải khóa theo commit SHA và dùng
Node 22.x, pnpm 10.5.2 cùng `pnpm install --frozen-lockfile`.

## Pull request / pre-merge

1. Secret scan toàn history/diff bằng Gitleaks hoặc công cụ tương đương; output phải redacted.
2. Chạy `pnpm verify`.
3. Chạy `pnpm audit --prod`; không chấp nhận advisory production.
4. Lưu log format/lint/typecheck/test/build/audit theo commit SHA.

## Integration

1. Tạo PostgreSQL disposable có database name chứa `test`, `ci`, `tmp` hoặc `disposable`.
2. Chỉ truyền URL đó qua `TEST_DATABASE_URL`; không dùng runtime/migration production URL.
3. Chạy `pnpm test:integration`; global setup tự chạy `prisma migrate deploy`.
4. Hủy database/branch sau job; giữ test report, không giữ payload/PII.

## E2E và release

1. Chạy Chromium public/auth boundary với provider stub.
2. Authenticated suite dùng Clerk staging storage state và fixture database disposable.
3. Trước release, chạy migration trên database staging trống và clone staging hiện tại, provider
   shadow smoke, restore drill và `pnpm smoke:production`.
4. PayOS payout/billing dùng hai credential sandbox riêng. Shopee reconciliation luôn off tới khi
   fixture hóa đơn thật và exact tie-out được review.
