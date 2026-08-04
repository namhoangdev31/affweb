# Fixture provenance

`shopee_reconciliation_invoice_sample.csv` là fixture synthetic phục vụ parser unit test, không phải
export từ Shopee và không được dùng để mở settlement/release.

Mọi fixture Hóa đơn đối soát mới chỉ được coi là provider authority khi có file gốc từ portal/email,
metadata kỳ/trạng thái/Affiliate ID, redaction review và exact line/total tie-out. File không có bộ
bằng chứng này phải giữ reconciliation hard-disabled.
