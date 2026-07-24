# Bộ tài liệu Cashback và Affiliate

**Baseline:** 1.0  
**Ngày hợp nhất:** 2026-07-24  
**Phạm vi ưu tiên:** Shopee Affiliate Việt Nam

Thư mục này chứa hai bộ tài liệu triển khai song ngữ và toàn bộ tài liệu nghiên
cứu nguồn. Các tài liệu nguồn được giữ lại để kiểm tra bằng chứng và lịch sử
quyết định; BRD và TDD là baseline dùng để quản lý phạm vi và triển khai.

## Tài liệu chính

| Loại                           | Tiếng Việt                                                    | English                                                    |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Business Requirements Document | [BRD tiếng Việt](./brd/cashback_affiliate_platform_brd_vi.md) | [English BRD](./brd/cashback_affiliate_platform_brd_en.md) |
| Technical Design Document      | [TDD tiếng Việt](./tdd/cashback_affiliate_platform_tdd_vi.md) | [English TDD](./tdd/cashback_affiliate_platform_tdd_en.md) |

Hai ngôn ngữ dùng chung mã `BRD-FR-*`, `BRD-NFR-*` và bảng truy vết. Khi thay
đổi yêu cầu hoặc thiết kế, phải cập nhật đồng thời hai phiên bản.

## Thứ tự đọc khuyến nghị

1. BRD để thống nhất sản phẩm, phạm vi, quy tắc và tiêu chí nghiệm thu.
2. TDD để triển khai kiến trúc, dữ liệu, API, sự kiện, state machine và vận hành.
3. Báo cáo nghiên cứu tổng hợp để kiểm tra nguồn và giới hạn từng nền tảng.
4. Chiến lược Shopee không App ID/App Secret và đánh giá repo để hiểu quyết định
   tích hợp Shopee cho MVP.
5. Blueprint và ma trận API để lập backlog connector và roadmap mở rộng.

## Tài liệu nghiên cứu được giữ lại

| Tài liệu                                                                                         | Nội dung                                                         |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [Báo cáo nghiên cứu tiếng Việt](./research/cashback_affiliate_research_report_vi.md)             | Phân tích hệ thống, API, Shopee, Taobao và kiến trúc tham chiếu  |
| [English research report](./research/cashback_affiliate_research_report.md)                      | English research baseline                                        |
| [Nghiên cứu thị trường 2026](./research/cashback_affiliate_market_research_2026_vi.md)           | Thị trường, đối thủ, mô hình kinh doanh và khoảng trống sản phẩm |
| [Blueprint triển khai](./research/cashback_platform_implementation_blueprint_vi.md)              | Kế hoạch kỹ thuật và vận hành chi tiết                           |
| [Chiến lược Shopee không App ID/App Secret](./research/shopee_affiliate_no_appid_strategy_vi.md) | Hướng direct link, report ingestion và lộ trình API được duyệt   |
| [Đánh giá kỹ thuật repo Shopee](./research/shopee_affiliate_repo_technical_assessment_vi.md)     | Phân loại code cộng đồng và giới hạn sử dụng                     |
| [Ma trận khả dụng API](./research/api_availability_matrix.csv)                                   | Ma trận nền tảng/API và điều kiện truy cập                       |

## Cấu trúc

```text
docs/
├── README.md
├── brd/
│   ├── cashback_affiliate_platform_brd_vi.md
│   └── cashback_affiliate_platform_brd_en.md
├── tdd/
│   ├── cashback_affiliate_platform_tdd_vi.md
│   └── cashback_affiliate_platform_tdd_en.md
└── research/
    ├── api_availability_matrix.csv
    ├── cashback_affiliate_market_research_2026_vi.md
    ├── cashback_affiliate_research_report.md
    ├── cashback_affiliate_research_report_vi.md
    ├── cashback_platform_implementation_blueprint_vi.md
    ├── shopee_affiliate_no_appid_strategy_vi.md
    └── shopee_affiliate_repo_technical_assessment_vi.md
```

## Quy ước bằng chứng

| Nhãn                    | Ý nghĩa                                                 |
| ----------------------- | ------------------------------------------------------- |
| `Observed`              | Đã kiểm tra trực tiếp trong phạm vi tài khoản được phép |
| `Officially documented` | Được nguồn chính thức hiện hành xác nhận                |
| `Inferred`              | Có bằng chứng hỗ trợ nhưng chưa trực tiếp xác minh      |
| `Third-party reported`  | Nguồn thứ ba, cần contract test hoặc xác nhận thêm      |
| `Proposed`              | Thiết kế đề xuất cho nền tảng mới                       |
| `Unknown`               | Chưa đủ dữ liệu, quyền hoặc sample để kết luận          |

Endpoint UI-private, browser cookie và hành vi từ repo cộng đồng không được coi
là API production. Tài liệu không lưu credential, cookie, access token, API key
hoặc định danh đơn hàng đầy đủ.

## Quản lý thay đổi

- Thay đổi yêu cầu: cập nhật BRD VI/EN, tiêu chí nghiệm thu và mã truy vết.
- Thay đổi contract kỹ thuật: cập nhật TDD VI/EN, schema version và test.
- Bằng chứng upstream mới: bổ sung tài liệu nghiên cứu, ghi ngày xác minh và
  phân loại bằng chứng.
- Không sửa ledger/state semantics chỉ bằng tài liệu vận hành; phải có ADR,
  migration và kế hoạch tương thích.
