# Hoàn Tiền

Web App/PWA affiliate cashback cho Shopee, ShopeeFood, AccessTrade và Lazada, xây bằng Next.js 16 App Router, React 19, Prisma 7, Clerk và PostgreSQL. Hệ thống dùng double-entry ledger, payout payOS có phân tách reviewer/approver, immutable evidence và các kill switch độc lập.

## Trạng thái triển khai

- Shopee direct link dùng packet `sub_id=affweb-<click>-<source>-<mode>-v2`; CSV Báo cáo chuyển đổi có contract Việt/Anh 47 cột. Hóa đơn đối soát vẫn hard-disabled tới khi có export thật.
- AccessTrade dùng Publisher API chính thức: product-link, transaction pagination, overlap và SubID.
- Lazada đã có signing, link/product/conversion contract, fixture test và mode `credential_ready`; chỉ chuyển `active` sau khi xác minh operation từ portal authenticated.
- Payout payOS dùng batch payout, idempotency, destination validation, `UNKNOWN` reconciliation và journal đối ứng khi thất bại.
- Clerk quản lý identity, Google/email OTP, invitation, hồ sơ, session và thiết bị; Prisma vẫn quản lý role, trạng thái nghiệp vụ, wallet, ledger và payout.
- Admin có Clerk invite/ban/unban/revoke-session, user-role control, rate versioning, three-person positive adjustment, payout budget, reconciliation case, raw evidence và CSV import có passkey.
- PWA có manifest, service worker, offline public shell, update prompt và opt-in Web Push; route tài chính luôn network-only.
- Production build và test không cần credential thật. Việc phát hành tiền thật vẫn fail-closed cho tới khi env, hạ tầng và feature flags được cấu hình.

Giấy tờ định danh cá nhân không thuộc source tree và không được ứng dụng lưu trữ.

## Chạy local

Yêu cầu Node.js 22 và pnpm 10.5.2. Chỉ cần PostgreSQL khi chạy app có dữ liệu hoặc integration test.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Không chạy deploy migration, seed hoặc integration test nếu database chưa được chứng minh là dev/test disposable. Không dùng `prisma db push` cho staging/production. Runtime dùng pooled `DATABASE_URL`; migration dùng `DIRECT_URL` hoặc `DATABASE_URL_UNPOOLED`.

## Kiểm định

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm test:unit
pnpm build
```

Integration chỉ chạy riêng với `TEST_DATABASE_URL`; guard yêu cầu database name có marker test/ci/tmp/disposable và từ chối database trùng runtime kể cả pooled/unpooled.

## Mô hình an toàn mặc định

- `registration.invite_only=true`
- `cashback.release.enabled=false`
- `payout.enabled=false`
- `connector.lazada.enabled=false`
- `connector.shopee_food_cashback=false`
- Payout tối thiểu 100.000 VND, tối đa 500.000 VND/ticket và user/ngày.
- Thay tài khoản ngân hàng khóa payout 72 giờ.
- Finance action cần passkey trong 10 phút; creator/reviewer/approver được tách biệt.
- Secret, affiliate cookie và bank account không xuất hiện trong Prisma/log/client bundle.

## Production

Đọc [production runbook](docs/operations/production-runbook.md), [Clerk cutover](docs/operations/clerk-cutover.md), [incident runbook](docs/operations/incident-runbook.md), [Lazada activation](docs/operations/lazada-activation.md) và [restore drill](docs/operations/restore-drill.md) trước khi bật tiền thật.

Các bước cuối:

```bash
NODE_ENV=production pnpm env:check
pnpm jobs:setup
pnpm smoke:production
```

Repository không chứa GitHub Actions. CI/release chạy bằng pipeline ngoài repository theo [external CI contract](docs/operations/external-ci-contract.md), khóa theo commit SHA và dùng database disposable cho migration/integration.
