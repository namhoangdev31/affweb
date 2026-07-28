# Lazada activation

Connector Lazada Affiliate dùng contract `/marketing/getlink` và
`/marketing/conversion/report`. Không dùng Seller API, operation đoán, private cookie hoặc webhook
không có signature contract.

## Trước preflight

- Giữ `LAZADA_MODE=credential_ready`, `connector.lazada.enabled=false` và account connector
  `CREDENTIAL_READY`.
- Tạo `PROVIDER_CREDENTIAL_ENCRYPTION_KEY_V1` là 32 byte base64; không dùng chung bank/Zalo key.
- Credential chỉ nhập một lần qua API quản trị, được mã hóa/versioned và chỉ trả fingerprint.
- Cấu hình Affiliate ID đúng account và validation hold 4–60 ngày.

## Preflight staging

1. Gọi health preflight bằng credential staging.
2. Tạo một tracking link và xác nhận outbound host, affiliate account và SubID round-trip.
3. Poll conversion report, kiểm tra VN/VND, monetary decimal string, pagination/cursor và evidence
   hash.
4. Xác nhận mapping `fulfilled`/`delivered` sang validation và `returned` sang correction; không có
   status nào tự release wallet.
5. Chạy sync chồng lấn 15 phút và nightly reconciliation 60 ngày; duplicate/mismatch bằng 0 hoặc có
   case giải thích.
6. Chỉ sau smoke thành công mới chuyển account connector sang `ACTIVE`, `LAZADA_MODE=active` và bật
   DB flag `connector.lazada.enabled`.

Finance settlement vẫn là bước riêng. Lazada order API và `estPayout` không phải bằng chứng tiền đã
được thanh toán.

Nếu schema/signature/identity không khớp, tắt DB flag và trả account về `CREDENTIAL_READY`; không sửa
canonicalization theo phỏng đoán.
