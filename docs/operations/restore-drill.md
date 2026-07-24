# Backup and restore drill

Mục tiêu beta: RPO không quá 15 phút, RTO không quá 2 giờ.

## Hằng đêm

Workflow `nightly-backup.yml` tạo PostgreSQL custom-format dump, mã hóa KMS và ghi S3 Object Lock 90 ngày. Neon PITR giữ 30 ngày. Raw evidence/audit giữ tối thiểu 7 năm hoặc theo tư vấn pháp lý.

## Diễn tập hằng quý

1. Chọn timestamp và tạo Neon restore/branch cô lập.
2. Tải logical dump gần nhất sang runner cô lập; xác minh Object Lock, version ID và checksum.
3. Restore bằng `pg_restore --clean --if-exists --no-owner` vào database trống, không nối production app.
4. Chạy `pnpm prisma migrate status`.
5. Chạy truy vấn deferred ledger invariant và `pnpm test:run` với database restore.
6. Đối chiếu tổng wallet projection với ledger liability theo user.
7. Đối chiếu payout `PAID/UNKNOWN`, provider receivable và raw evidence object.
8. Ghi thời gian restore, RPO thực tế, RTO thực tế, lỗi và owner khắc phục.
9. Xóa môi trường restore bằng quy trình hạ tầng có phê duyệt.

Backup chỉ được đánh dấu hợp lệ khi ledger mismatch bằng 0 và sample evidence đọc được từ S3.
