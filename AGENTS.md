# AGENTS.md

Quy tắc repository-wide cho mọi coding agent làm việc trong `affweb`.

## 1. Đọc trước khi làm

Theo thứ tự:

1. `AGENTS.md`.
2. `context.md`.
3. Phần liên quan trong `project_map.json`.
4. TDD/BRD/threat model/runbook chỉ khi tác vụ chạm tới phạm vi đó.

Không đọc hoặc in `.env.local` ra output. Chỉ kiểm tra tên biến/trạng thái đã redacted khi thật sự cần.

## 2. Think Before Coding

Không đoán im lặng và không che giấu điểm chưa rõ.

Trước khi sửa:

- Nêu giả định có ảnh hưởng đến kết quả.
- Nếu yêu cầu có nhiều cách hiểu, trình bày khác biệt và trade-off.
- Nếu có cách đơn giản hơn, nói rõ.
- Với điểm mơ hồ có thể gây thay đổi nghiệp vụ, tài chính, dữ liệu hoặc API contract: dừng và hỏi.
- Với điểm nhỏ, ít rủi ro: chọn giả định hợp lý, ghi lại và tiếp tục.

Chuyển yêu cầu thành tiêu chí kiểm chứng:

```text
1. Thay đổi X -> verify bằng Y
2. Bảo toàn invariant Z -> verify bằng test/check W
3. Không regression -> chạy bộ lệnh phù hợp
```

Không dùng kế hoạch mơ hồ kiểu “review, improve, test”.

## 3. Simplicity First

Viết lượng code tối thiểu giải quyết đúng yêu cầu hiện tại.

- Không thêm feature ngoài scope.
- Không tạo abstraction cho một use case duy nhất.
- Không thêm option/config “để sau này có thể cần”.
- Không viết error handling cho trạng thái thật sự bất khả thi.
- Nếu implementation dài hơn nhiều so với bản chất vấn đề, đơn giản hóa.
- Ưu tiên pure function nhỏ cho rule/state machine; không tạo framework nội bộ.

Complexity chỉ hợp lý khi business invariant, concurrency, security hoặc provider contract thật sự yêu cầu.

## 4. Surgical Changes

Mỗi dòng thay đổi phải truy ngược được về yêu cầu.

- Không refactor, rename, reformat hoặc “dọn đẹp” code lân cận nếu không cần.
- Giữ style hiện có: TypeScript strict, dấu `;`, quote kép, trailing comma theo Prettier hiện tại.
- Không đổi public/API behavior khi tác vụ không yêu cầu.
- Chỉ xóa import/biến/hàm trở thành unused do chính thay đổi hiện tại.
- Nếu thấy dead code hoặc lỗi ngoài scope, ghi chú; không tự xóa/sửa.
- Không ghi đè thay đổi có sẵn của người dùng.

Ví dụ anti-pattern cần tránh:

- Sửa empty-email nhưng tiện thể thay toàn bộ email/username validation.
- Thêm logging nhưng đổi quote style, type signature và control flow.
- “Tối ưu search” bằng cache/index/async cùng lúc khi chưa biết mục tiêu latency hay throughput.
- Tạo Strategy/Manager/Config cho một phép tính đơn giản.

## 5. Goal-Driven Execution

Định nghĩa trạng thái hoàn tất và lặp cho đến khi có bằng chứng.

- Bug: viết hoặc xác định test tái hiện trước, rồi sửa, rồi chạy regression.
- Validation: test input không hợp lệ và hợp lệ.
- Refactor: test trước và sau phải cho behavior tương đương.
- Concurrency/financial change: cần test race/idempotency/invariant tương xứng.
- Không tuyên bố “xong” nếu lint/typecheck/test/build liên quan chưa chạy hoặc chưa nói rõ vì sao không chạy được.

Chọn mức kiểm định theo rủi ro, không chạy full suite vô nghĩa cho thay đổi tài liệu nhỏ.

## 6. Invariant riêng của dự án

### Money và ledger

- Persisted money là `bigint` VND.
- Tỷ lệ là integer basis points `0..10000`.
- Không dùng `number`/float cho ledger, wallet, payout hoặc commission persisted.
- Mọi journal phải balanced và mọi line phải dương.
- Ledger append-only; correction dùng compensating transaction.
- `WalletProjection` phải thay đổi trong cùng transaction với journal liên quan.
- Posting cần idempotency key deterministic.
- Thao tác wallet/payout cạnh tranh cần row lock/Serializable khi thích hợp.
- Không nới lỏng DB check/trigger nếu không có quyết định kiến trúc rõ ràng và migration/test.

### Conversion và connector

- Giữ natural key và dedupe xuyên nguồn.
- Tôn trọng authority: authoritative > provisional > auxiliary.
- Raw evidence phải được hash trước khi canonical state dùng nó.
- Không dùng undocumented private endpoint/cookie như production contract.
- Mọi network connector cần timeout, schema validation, bounded pagination/retry và safe error.
- URL do user/provider đưa vào phải qua allowlist/policy; không mở redirect/SSRF.
- Connector mới phải có health check, evidence class, cursor/overlap, fixture/contract test và kill switch trước khi active.

### Payout và admin

- Payout fail-closed nếu thiếu env hoặc DB flag.
- Không bỏ qua beneficiary hold, daily/user/system limits hoặc passkey.
- Không gộp creator/reviewer/approver nếu rule hiện tại yêu cầu tách biệt.
- `UNKNOWN` phải reconcile; không retry gửi tiền theo suy đoán.
- Role check phải qua `requireRole`/`requireApiRole`, không tự kiểm tra sơ sài ở UI.

### Identity và privacy

- Clerk là identity provider; PostgreSQL giữ authorization và business state.
- Chỉ primary email đã verify được reconcile.
- Admin cần allowlist + verified Google + fresh Clerk session.
- Không đưa secret, cookie, token, bank plaintext/cipher, PII hoặc raw production payload vào log, test fixture, context hay client bundle.
- Dùng `AppError`/`errorResponse` để không làm lộ lỗi nội bộ.

### Tenant/KOC

- Mọi tài khoản là member nền tảng; `Tenant.ownerUserId` biểu diễn admin nhóm và không thay thế các role staff/finance của hệ thống.
- Một user chỉ sở hữu tối đa một tenant. Tenant owner tự mua hàng phải đi theo Affiliate ID/rate nền tảng, không dùng Affiliate ID của tenant mình.
- Member tenant chỉ dùng Shopee Affiliate ID của owner khi tenant còn hiệu lực và có cấu hình đầy đủ; thiếu cấu hình phải fail-closed, không fallback sang Affiliate ID nền tảng.
- Tỷ lệ hoàn tenant là integer basis points `100..10000` và phải snapshot tại link time.
- Cashback tenant = hoa hồng thực nhận trừ 10% thuế ước tính, sau đó mới nhân tỷ lệ hoàn member; mọi bước làm tròn xuống bằng bigint.
- Hoa hồng tenant về tài khoản Affiliate riêng của owner. Conversion tenant chỉ ghi nhận/đối soát; không post ledger, wallet hoặc payout nền tảng.
- Owner chỉ được đánh dấu conversion tenant `VALIDATED` là đã chi trả bên ngoài hệ thống; thao tác phải kiểm tra ownership, idempotent và có audit.
- Không xây parser/importer báo cáo provider khi chưa có fixture/schema thật và contract test.

### PWA

- Không cache API, auth, dashboard, admin, payout hoặc redirect tài chính.
- Push payload không chứa số tài khoản hoặc chi tiết tiền nhạy cảm.
- Thay service worker phải chạy `src/app/sw.test.ts` và E2E PWA liên quan.

## 7. Database và environment

- `.env.example` chỉ chứa tên/default không bí mật.
- `.env` và `.env.local` luôn gitignored và không được đưa vào `project_map.json`.
- Runtime DB dùng `DATABASE_URL` pooled.
- Prisma migration dùng `DIRECT_URL` hoặc `DATABASE_URL_UNPOOLED`.
- Không dùng `prisma db push` trên staging/production.
- Schema change phải có migration; không sửa migration đã phát hành.
- Seed phải idempotent.
- Không chạy seed, migration write hoặc integration test lên DB không chứng minh là dev/test.
- Integration test hiện tự chạy khi process có `DATABASE_URL`; vì `.env` local có biến này, chỉ chạy full test trên DB disposable/isolated.
- Process env của CI/Vercel phải ưu tiên hơn file local.

## 8. Test và lệnh chuẩn

Toolchain:

- Node 22.x.
- pnpm 10.5.2.

Kiểm tra thường dùng:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm test:run
pnpm build
```

E2E:

```powershell
pnpm test:e2e --project=chromium
```

Unit test không chạm integration DB:

```powershell
pnpm exec vitest run src
```

`pnpm test:run` gồm cả `tests/integration`; chỉ chạy trên DB riêng. Không bật feature flag tiền thật, chạy QStash setup, bootstrap admin, seed hoặc production smoke nếu tác vụ không yêu cầu rõ.

## 9. Quy tắc làm việc với file và Git

- Tìm file/text bằng `rg`/`rg --files`.
- Dùng `apply_patch` cho edit có chủ đích.
- Không chạy destructive Git/filesystem command.
- Không reset/revert thay đổi không phải của agent.
- Kiểm tra `git diff --check` và `git diff` trước khi bàn giao.
- Không commit/push nếu người dùng chưa yêu cầu.
- Không commit `.env`, `.env.local`, `.next`, generated Prisma client, test report hoặc dependency artifacts.

## 10. Duy trì context

Không thêm generator/package script vào repo nếu người dùng không yêu cầu. Sau thay đổi source/config/doc, cập nhật `project_map.json` trong cùng tác vụ bằng công cụ ngoài repo hoặc chỉnh có kiểm soát.

`project_map.json` phải:

- Liệt kê mọi file tracked/untracked hợp lệ, trừ secret/generated/dependency.
- Có purpose, hash và category cho từng file.
- Với TS/TSX: có route/runtime/import/export/declaration/function calls khi áp dụng.
- Với Prisma: có model/enum/field.
- Không chứa giá trị env.

Cập nhật `context.md` nếu thay đổi:

- Kiến trúc hoặc domain boundary.
- Business/security invariant.
- Critical flow.
- External service hoặc connector status.
- Environment/toolchain/command.
- Database/deployment/operations.

## 11. Checklist bàn giao

Trước khi kết thúc:

1. Scope đã được đáp ứng, không thêm feature thừa.
2. Invariant liên quan còn nguyên.
3. Secret không xuất hiện trong diff/output.
4. Test/check tương xứng đã chạy và kết quả được báo chính xác.
5. `project_map.json` đã regenerate.
6. `context.md` đã cập nhật nếu cần.
7. `git diff --check` sạch.
8. Nêu rõ blocker hoặc kiểm định chưa thể chạy; không nói quá kết quả.
