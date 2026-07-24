# Incident runbook

## Ưu tiên đầu tiên

Không sửa/xóa ledger, conversion hoặc raw evidence. Dừng dòng tiền bằng kill switch, giữ bằng chứng, xác định blast radius rồi mới reconcile.

| Tín hiệu                              | Hành động ngay                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ledger mismatch                       | Tắt `cashback.release.enabled` và `payout.enabled`; dừng finance action; giữ database snapshot    |
| Duplicate payout/idempotency conflict | Tắt `payout.enabled`; không retry; query payOS theo provider payout ID                            |
| Payout `UNKNOWN` > 15 phút            | Tắt submit mới nếu tăng nhanh; chạy reconciliation; không tạo attempt mới trước khi có trạng thái |
| Connector lag > 30 phút/401           | Tắt release của nguồn liên quan; giữ conversion cũ; sửa credential trên provider/env              |
| QStash DLQ                            | Tắt job gây side effect nếu cần; replay bằng cùng idempotency key                                 |
| Conversion volume bất thường          | Chuyển connector sang `SHADOW`/kill switch; kiểm tra raw evidence và SubID                        |
| S3 evidence lỗi                       | Dừng acknowledgement/release; kiểm tra OIDC, Object Lock và KMS                                   |
| Credential leak                       | Thu hồi/rotate tại provider trước; cập nhật env; redeploy; audit log access                       |

## Thu thập bằng chứng

- build SHA, request ID, actor ID, connector config ID, sync run ID;
- payout ticket/attempt/provider ID nhưng không chép account number;
- raw evidence object key + SHA-256;
- Sentry event, Vercel request log và QStash message ID;
- ledger invariant và wallet projection tại thời điểm incident.

Không dán secret, cookie, token, số tài khoản đầy đủ hoặc giấy tờ định danh vào Slack/GitHub/ticket.

## Khôi phục

- App regression: promote deployment cũ.
- Schema: forward-fix; PITR chỉ khi có phê duyệt incident commander.
- Provider correction: ingest revision và journal đối ứng.
- payOS timeout/5xx: trạng thái `UNKNOWN`, query trước retry.
- Ledger mismatch: tạo migration/command sửa bằng journal mới; không UPDATE entry cũ.

## Kết thúc incident

Chỉ mở flag sau khi invariant bằng 0, replay idempotent, provider reconciliation sạch, smoke test xanh và hai người finance xác nhận. Viết postmortem gồm timeline, nguyên nhân, blast radius, số tiền, control thiếu và owner/deadline.
