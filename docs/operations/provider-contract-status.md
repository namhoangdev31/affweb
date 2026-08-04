# Provider contract status — Core v1

Tài liệu này là release gate. Credential hợp lệ chỉ mở quyền gọi API; không tự biến order status
thành settlement authority.

| Provider/path    | Acquisition                                                           | Authority                                                                                                                | Release gate                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopee Direct    | Link trực tiếp; Orders từ CSV `Báo cáo chuyển đổi`                    | Orders chỉ xác nhận validation. Chỉ file chi tiết **Hóa đơn đối soát** đã đóng mới có thể settle                         | Orders parser có fixture provider Việt/Anh 47 cột. Reconciliation route hard-disabled đến khi có export thật đã redacted, AFF ID/account identity và exact line tie-out |
| Lazada Direct    | `/marketing/getlink`; poll `/marketing/conversion/report`             | Poll API authoritative cho order validation; postback chỉ auxiliary. `fulfilled`/`delivered` không chứng minh settlement | Credential preflight, VN/VND, SubID round-trip, fixture/contract test, health record và DB kill switch                                                                  |
| AccessTrade      | `/v1/product_link/create`; poll transaction/order/product/detail APIs | `approved` chỉ xác nhận validation. Finance settlement từ evidence đã verify mới release                                 | Credential mới sau rotation, publisher/account match, campaign explicit, fixture/contract test, 10 request/phút, health record và DB kill switch                        |
| PayOS billing    | SDK chính thức                                                        | Webhook đã verify và invoice snapshot match                                                                              | Credential billing riêng, sandbox smoke, duplicate/mismatch tests                                                                                                       |
| Zalo central bot | Secret-token verified webhook                                         | Không có authority tài chính                                                                                             | Bot token/secret, encryption key, staging bind/reply smoke                                                                                                              |

## Hai state machine

- Order validation: `TRACKED → DELIVERED → VALIDATION_HOLD → VALIDATED`; lỗi/hoàn/hủy đi
  `REJECTED`, `RETURNED`, `CANCELLED` hoặc `REVIEW_REQUIRED`.
- Settlement: `UNBILLED → INCLUDED_IN_RECONCILIATION → RECONCILIATION_CLOSED →
FINANCE_CONFIRMED → RELEASED`; correction sau release dùng `REVERSED` và compensating journal.
- `holdDays` phải được cấu hình cho từng provider account/campaign trong khoảng 4–60 ngày. Hết hold
  không được thay đổi available wallet.
- Không merge identity giữa Lazada Direct và AccessTrade dù cùng merchant/order URL.

## Shopee

`POST /api/v1/imports/shopee-orders` nhận CSV multipart UTF-8 có giới hạn kích thước, dòng/cell và
hash raw evidence. Chỉ chấp nhận đúng schema Việt/Anh 47 cột đã quan sát. Schema drift, SubID v2
malformed, duplicate natural key hoặc click không thuộc account khóa batch; đơn không hoàn thành là
non-payable và không tác động ledger/wallet.

`POST /api/v1/imports/shopee-reconciliation-invoices` trả fail-closed trước auth và body parsing;
env/DB flag không thể mở trong bản này. Ảnh
chụp, trang tổng hợp, “Lịch sử thanh toán” hoặc tổng hóa đơn không được release. Chỉ triển khai parser
khi có file chi tiết từ “Xem chi tiết/Bảng kê thanh toán” và chứng minh được:

1. AFF ID/provider account đúng scope;
2. invoice `Đã đóng` được map thành `RECONCILIATION_CLOSED`, không phải `PAID`;
3. mọi line khớp đúng conversion;
4. tổng line tie-out chính xác với tổng invoice;
5. unknown/duplicate/unmatched line khóa toàn batch.

## Lazada và AccessTrade

- Lazada Direct là lựa chọn mặc định cho URL Lazada. AccessTrade chỉ được dùng khi request chọn
  campaign đã cấu hình; không fallback ngầm.
- Mọi response monetary được lossless-parse thành decimal string, rồi floor sang `bigint` VND tại
  canonical boundary.
- Connector có timeout, response-size bound, schema validation, bounded pagination/retry, overlap,
  nightly 60-day reconciliation, health record và kill switch.
- Tenant-managed credential chỉ dành cho Business. Owner mua cho chính mình vẫn dùng
  platform-managed account.
- Credential mã hóa/versioned, API chỉ trả fingerprint/status. AccessTrade key từng xuất hiện trong
  hội thoại/tài liệu không còn hợp lệ để triển khai và phải rotate trước preflight.

## Finance settlement

`POST /api/v1/admin/settlement-batches` yêu cầu Finance/Super Admin, recent Clerk session, recent
passkey, reason và `Idempotency-Key`. Batch phải exact-match platform conversion đã `VALIDATED`; batch,
journal và wallet chỉ được release một lần trong Serializable transaction. Tenant batch không post
platform ledger/wallet.

Xem thêm [Evidence retention policy](evidence-retention-policy.md).
