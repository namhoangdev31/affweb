# Clerk Marketplace cutover

## Trạng thái khóa

- Vercel project: `aff-shop`.
- Clerk được cài bằng Vercel Marketplace.
- Clerk Application ID duy nhất: `app_3GxTUr7hRQ5aU7hJX2kz7DWGu6U`.
- Clerk quản lý identity, invitation, Google/email OTP, session, thiết bị và hồ sơ.
- Prisma quản lý `User.id`, trạng thái nghiệp vụ, role, wallet, ledger, beneficiary và payout.
- Không lưu Clerk key trong Prisma, Git, tài liệu hoặc log.

## Dashboard Clerk

Trên đúng application:

1. Bật Restricted mode; tắt đăng ký công khai.
2. Bật Google và email verification code/OTP.
3. Tắt multi-session account switching và Organization.
4. Đặt maximum member session lifetime 30 ngày; nếu gói hiện tại không hỗ trợ thì không mở beta cho tới khi nâng gói hoặc chấp nhận chính sách khác bằng review bảo mật.
5. Tắt self-delete trong Clerk UserProfile. User phải gửi yêu cầu xóa tại `/app/settings`.
6. Cấu hình Terms, Privacy, email branding, production domain và authorized parties.
7. Production Google OAuth phải dùng credential riêng.

Admin chỉ hợp lệ khi email thuộc `ADMIN_EMAIL_ALLOWLIST`, Clerk có Google connection đã xác minh và session không quá 8 giờ. Finance action vẫn cần passkey nội bộ trong 10 phút.

## Environment theo target

Marketplace phải cấp:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

Application tự quản lý:

```text
CLERK_APPLICATION_ID=app_3GxTUr7hRQ5aU7hJX2kz7DWGu6U
CLERK_WEBHOOK_SIGNING_SECRET
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/app
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/app
WEBAUTHN_CHALLENGE_SECRET
```

- Development/Preview dùng `pk_test_` và `sk_test_`.
- Production chỉ dùng `pk_live_` và `sk_live_`.
- Mỗi target dùng webhook signing secret và WebAuthn challenge secret riêng.
- Không chuyển development secret sang Preview/Production để làm build tạm.

## Webhook

Tạo endpoint cho từng environment:

```text
https://<domain>/api/webhooks/clerk
```

Subscribe tối thiểu:

- `user.created`
- `user.updated`
- `user.deleted`

Lưu signing secret vào `CLERK_WEBHOOK_SIGNING_SECRET` đúng target. Endpoint bắt buộc chữ ký hợp lệ, dùng `svix-id` làm idempotency key và cho phép Clerk retry. Khi webhook chậm, JIT reconciliation vẫn chỉ liên kết email chính đã xác minh với local invitation hợp lệ.

## Migration và bootstrap

Migration `202607250001_add_clerk_identity` là expand-only; bảng Auth.js cũ được giữ trong cửa sổ rollback.

```bash
pnpm db:deploy
pnpm clerk:bootstrap-admin admin@example.com
```

Script bootstrap chỉ cấp `SUPER_ADMIN` nếu email thuộc allowlist, primary email đã xác minh và Clerk user có Google connection đã xác minh.

## Smoke test

1. Admin invite email từ `/admin/users`.
2. Người được mời mở email, đăng ký bằng email OTP hoặc Google.
3. Xác nhận chỉ có một local user, một wallet và role `USER`.
4. Xác nhận `/app/profile` quản lý hồ sơ/thiết bị.
5. Ban user; truy cập bị chặn ngay và Clerk session bị thu hồi.
6. Unban user; local state chỉ chuyển `ACTIVE` sau khi Clerk thành công.
7. Thay role; session bị thu hồi và quyền mới có hiệu lực từ Prisma.
8. Gửi yêu cầu xóa khi ví có số dư để xác nhận trạng thái `BLOCKED`.
9. Với fixture không còn nghĩa vụ tài chính, duyệt xóa và xác nhận webhook ẩn danh PII nhưng không xóa ledger/payout.

## Cutover và cleanup

Giữ deployment Auth.js cũ cùng database checkpoint trong bảy ngày, nhưng deployment mới không ghi vào bảng Auth.js. Theo dõi webhook failure, `401/429`, sync conflict, ban mismatch và admin session failure.

Sau bảy ngày ổn định mới tạo cleanup migration xóa `Account`, `Session`, `VerificationToken`, `Authenticator` và các env `AUTH_*`. Sau cleanup chỉ rollback bằng forward-fix hoặc PITR.
