# Evidence retention policy

## Phạm vi

Áp dụng cho raw provider response, CSV import, Shopee reconciliation detail, Finance settlement,
conversion revision và mọi evidence đã ảnh hưởng ledger, wallet hoặc payout.

## Quy tắc

1. Raw bytes/payload phải được SHA-256 trước khi canonical state sử dụng.
2. Production lưu raw object trong bucket bật versioning, KMS và Object Lock/WORM. Database chỉ giữ
   object key, hash, schema version, provider/account fingerprint, actor, thời điểm và external
   reference cần thiết.
3. `SettlementEvidence` là append-only bằng database trigger. Correction tạo evidence và
   compensating journal mới; không sửa/xóa lịch sử.
4. Người dùng có thể ẩn/xóa bản import hiển thị cá nhân. Nếu import đã tạo settlement batch,
   journal, wallet release hoặc payout, raw/canonical evidence vẫn được giữ cho audit.
5. Không lưu secret, authorization header, cookie, bank plaintext, raw PII không cần thiết hoặc
   provider credential trong metadata/log.
6. Raw evidence/audit production giữ tối thiểu 2555 ngày theo runbook hiện tại, hoặc lâu hơn nếu
   chính sách pháp lý/kế toán được phê duyệt yêu cầu. Object Lock không được rút ngắn bằng thao tác
   ứng dụng.

## Xóa và sự cố

- Xóa logical chỉ thay đổi khả năng hiển thị; không cascade sang immutable evidence.
- Integrity job định kỳ kiểm tra object tồn tại và SHA-256 khớp.
- Mismatch/missing object phải tắt release liên quan, mở reconciliation case và xử lý theo
  [incident runbook](incident-runbook.md).
- Restore drill phải chứng minh đọc được sample evidence và đối chiếu hash trước khi backup được coi
  là hợp lệ.
