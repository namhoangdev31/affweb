# Lazada activation

Connector Lazada được giữ fail-closed ở `credential_ready`. Operation path có thể override bằng env vì tên operation/schema phải được lấy từ portal Lazada Affiliate authenticated, không suy đoán từ Seller API.

## Trước khi có credential

- Giữ mock/fixture signature, pagination, token expiry, SubID và correction xanh.
- Xác nhận trong portal ba operation: link generation, product search và conversion report.
- Cập nhật `LAZADA_*_OPERATION` nếu portal cấp path khác mặc định.
- Không bật `connector.lazada.enabled`.

## Khi key/token được cấp

1. Nạp `LAZADA_AFFILIATE_ID`, `LAZADA_LITE_APP_KEY`, `LAZADA_LITE_APP_SECRET`, `LAZADA_USER_TOKEN` vào staging.
2. Đặt `LAZADA_MODE=shadow`; migrate không cần thiết.
3. Redeploy, gọi health check và tạo một link test.
4. Xác nhận SubID round-trip bằng order hợp lệ/sanitized fixture.
5. Shadow sync 24 giờ, kiểm tra raw evidence, pagination, timezone, currency, correction và duplicate.
6. Reconcile portal totals với DB; sai lệch phải bằng 0 hoặc có case giải thích.
7. Lặp lại env production, deploy với `shadow`.
8. Sau phê duyệt, đặt `LAZADA_MODE=active` và bật flag `connector.lazada.enabled`.

Nếu signature/operation schema không khớp, quay lại `credential_ready`; không chỉnh canonicalization dựa trên phỏng đoán.
