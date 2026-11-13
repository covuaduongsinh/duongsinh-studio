# Nhập dữ liệu Lark Base cho NocoEdu (V6.1)

Cách Studio nhập dữ liệu từ Lark Base vào app NocoEdu mà không để token Lark trên runner hay trong tab Biến của app.

## Luồng

1. Lệnh `edu import-lark` nằm **trong repo NocoEdu** (không phải repo Studio). Nó lấy `tenant_access_token` từ `LARK_APP_ID` và `LARK_APP_SECRET`, đọc Bitable theo trang tối đa 500 bản ghi, ghi tuần tự (mỗi lô tối đa 500, một lệnh ghi một lúc trên cùng một Base), gặp 429 thì chờ rồi thử lại theo cấp số nhân.
2. Studio chạy lệnh đó qua kênh job (`docs/trien-khai-vps.md`, "Kênh job"): `POST /api/releases/apps/<app>/jobs` với `larkImportDry` (chỉ đọc, in số đếm và khác biệt theo cột) hoặc `larkImportCommit` (ghi).
3. **Agent chỉ chạy `larkImportDry`** (playbook `!nhap-lark`). `larkImportCommit` chỉ chủ dự án chạy, sau khi có sao lưu Postgres của app (`backup-nb3.sh`).
4. Lệnh không được in bản ghi: log có thể chứa tên/ID học viên. Daemon chỉ giữ 20 KB cuối, che bí mật, xoá sau 14 ngày.

## App Lark và bí mật

| Mục              | Giá trị                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loại app         | App tự dựng (custom app) của tổ chức trên Lark Developer, dùng `tenant_access_token`. Không dùng OAuth người dùng, không `lark-cli` trên runner.              |
| Quyền (scope)    | `bitable:app:readonly` cho bước đọc. Chỉ thêm quyền ghi vào Lark nếu sau này cần ghi ngược; nhập về NocoEdu không cần.                                        |
| Người giữ secret | Chủ dự án. Đặt bằng `PUT /api/releases/apps/<app>/jobSecrets/LARK_APP_ID` và `.../LARK_APP_SECRET` (chỉ chủ sở hữu). Studio không lưu, không trả lại giá trị. |
| Nơi secret nằm   | File `jobs/<app>.env` (0600) trên máy chủ; chỉ service `-job` đọc, service web không.                                                                         |
| Tên miền Lark    | Mặc định `open.larksuite.com` (đã có trong danh sách cho phép đề xuất của runner, `server/runner/service.ts`; runner hiện chưa bị giới hạn mạng).             |
| Bảng nguồn       | Do lệnh của NocoEdu khai (tham số `table` của playbook); danh sách bảng và ánh xạ cột thuộc tài liệu của repo NocoEdu.                                        |

## Giới hạn API

- Đọc: tối đa 500 bản ghi mỗi trang. Ghi: tối đa 500 mỗi lô.
- Giới hạn tốc độ (QPS) của Bitable cho app tự dựng: **chưa tra** (cần đọc tài liệu Lark hiện hành hoặc đo). Cho đến khi có số, lệnh ghi tuần tự và lùi theo cấp số nhân khi gặp 429.
- Một lệnh ghi một lúc trên cùng một Base; daemon cũng chỉ cho một job mỗi app.

## Kiểm tra

Studio không có test Lark thật; test của lệnh nhập nằm trong repo NocoEdu (playbook đòi ghi đường dẫn test vào PR). Ở đây chỉ kiểm playbook và đường kênh job.
