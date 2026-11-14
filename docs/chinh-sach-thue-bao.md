# Chính sách thuê bao và đối chứng (đợt T, bước T9)

Tài liệu này ghi cách Dương Sinh Studio dùng công cụ lập trình có thuê bao (Claude Code, Codex), đường lui nếu điều kiện
đổi, và cách đối chứng với Paperclip. **Chưa phải ý kiến pháp lý.** Mọi điều khoản của nhà cung cấp phải do chủ dự án tự
đọc ở trang chính thức; tài liệu này không trích điều khoản từ trí nhớ.

Ngày soạn: 14/11/2026. Ngày chủ dự án đọc các trang dưới đây: **\_\_ / \_\_ / \_\_** (điền khi đọc, mỗi lần đọc một dòng).

## 1. Studio đang dùng công cụ thế nào (sự thật về hệ thống, không phải về điều khoản)

- Studio **không** gọi mô hình trực tiếp cho công việc lập trình: nó giao việc cho một **runner** chạy CLI chính hãng của công
  cụ (Claude Code, Codex…) trên máy mà runner đứng. Runner đăng nhập bằng tài khoản của chủ máy.
- Hai nơi runner đứng: **máy dev của chủ dự án** và **VPS production** (một người dùng riêng, bị giới hạn bởi `user-1002.slice`:
  2,5 GiB RAM, 3 CPU; xem `docs/runner-resource-limits-proposal.md`).
- Việc là của chính công ty: các dự án và issue trong Studio do người của công ty tạo. Studio không cho người ngoài công ty
  đăng nhập để dùng thuê bao.
- **Giới hạn song song**: mỗi agent có `maxConcurrentRuns`; mỗi dự án có `maxActiveIssues` ở cài đặt Tự lái; ngân sách ở Cài đặt →
  Ngân sách chặn khi hết lượt chạy hay token; khi công cụ báo hết hạn mức, Studio giãn việc (`toolQuota`, mục Hạn mức trên
  Hôm nay). Các giới hạn này giữ số phiên chạy cùng lúc ở mức vừa phải, nhưng **không phải** là cam kết tuân thủ điều khoản.

## 2. Điều chủ dự án cần tự kiểm (Studio không khẳng định thay)

Đọc kỹ từng trang, chép ngày đọc và kết luận vào bảng ở mục 5. Những điểm cần xác nhận, **chưa có câu trả lời ở đây**:

| Câu hỏi                                                                                                                   | Trang để đọc                                                                                    | Trạng thái        |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| Chạy Claude Code bằng đăng nhập thuê bao, không có người ngồi trước máy (CLI chạy do một dịch vụ khác gọi) có được không? | Claude Code: trang Legal and compliance — https://code.claude.com/docs/en/legal-and-compliance  | chủ dự án tự kiểm |
| Nhiều phiên chạy tự động cùng lúc trên một thuê bao có được không, giới hạn bao nhiêu?                                    | Điều khoản sử dụng của gói đang dùng — https://www.anthropic.com/legal (chọn đúng gói)          | chủ dự án tự kiểm |
| Dùng API key thay cho đăng nhập thuê bao thì điều khoản nào áp dụng?                                                      | Điều khoản thương mại của Anthropic — https://www.anthropic.com/legal/commercial-terms          | chủ dự án tự kiểm |
| Codex: dùng đăng nhập ChatGPT hay API key cho phiên tự động?                                                              | Điều khoản của OpenAI — https://openai.com/policies/ (chọn điều khoản dịch vụ/ sử dụng phù hợp) | chủ dự án tự kiểm |

Nếu có điểm nào "không được" hoặc "không rõ", dùng đường lui ở mục 3 cho đến khi rõ.

## 3. Đường lui: đổi nguồn mà không sửa mã

Kiểm trước (14/11/2026): cấu hình agent của plugin `agents` **không có** trường "nguồn" kiểu thuê bao / API key. Trường
`source` của agent chỉ nói agent _đến từ đâu_ (do runner báo hay do ứng dụng định nghĩa). Thứ quyết định việc chạy bằng gì là
**đăng nhập của công cụ trên máy runner** và danh sách `modelEntries` của agent (công cụ + mô hình + mức suy luận, theo thứ tự).
Vì vậy đổi nguồn là việc cấu hình, không cần sửa mã:

1. **Đổi đăng nhập trên máy runner**: đăng xuất công cụ khỏi tài khoản thuê bao, đăng nhập bằng API key (hoặc ngược lại) theo
   hướng dẫn của công cụ. Agent giữ nguyên tên và lịch sử; runner báo lại tool/model như cũ.
2. **Thêm agent chạy công cụ khác** (ví dụ Codex thay cho Claude Code) ở Cài đặt → Agent: một mục `modelEntries` khác, rồi giao việc
   cho agent đó; trưởng nhóm agent chọn theo "giỏi việc gì".
3. **Chặn tạm một nhà cung cấp**: tắt agent đó (`status: disabled`) hoặc đặt ngân sách chặn cho nó; việc tự chuyển sang agent
   khác khi trưởng nhóm giao lại.
4. **Theo dõi chi phí khác nhau theo nguồn**: Studio chưa ghi "thuê bao hay API key" cho từng agent. Nếu cần báo cáo chi phí tách
   theo nguồn, đặt tên agent kèm nhãn (ví dụ "Claude · API") hoặc ghi vào mô tả "giỏi việc gì"; một trường riêng chỉ nên thêm khi
   plugin `agents` có chỗ cho nó, tránh sửa lệch với upstream.

## 4. Đối chứng với Paperclip (Q6: Paperclip, máy dev, 2 tuần)

Mục đích: biết Studio có đang kém rõ rệt một công cụ điều phối khác không, bằng số, trước khi bàn chuyện thay.

1. **Điểm chuẩn Studio (T0)**: trên máy dev, chạy `ds-studio bench run` (set `ds-core`, 10 việc). Ghi vào nhật ký đợt T: tỉ lệ đạt,
   thời gian, token, số lần cần người vào. Hiện **chưa có số**; không dùng số ước lượng.
2. **Cài Paperclip trên máy dev** (giấy phép MIT theo báo cáo nghiên cứu; chủ dự án tự kiểm lại giấy phép của bản đang cài).
   Không cài trên VPS production, không nối vào dữ liệu thật.
3. **Chạy đúng 10 việc `ds-core`** (mô tả trong `server/bench/`) bằng cùng công cụ và cùng mô hình, ghi cùng bốn số.
4. **Ghi đối chiếu** theo bảng:

   | Số                   | Studio | Paperclip |
   | -------------------- | ------ | --------- |
   | Tỉ lệ đạt (/10)      |        |           |
   | Thời gian trung bình |        |           |
   | Token trung bình     |        |           |
   | Số lần cần người vào |        |           |

5. **Quyết định**: chỉ cân nhắc chuyển khi Paperclip hơn rõ ở **cả** tỉ lệ đạt **và** số lần cần người. Nếu không, đóng câu hỏi
   "thay Studio" đến quý sau (kế hoạch T mục 7 đã loại việc chuyển sang Paperclip/Multica khỏi đợt này).

## 5. Nhật ký đọc điều khoản

| Ngày đọc | Trang | Người đọc | Kết luận ngắn | Việc cần làm |
| -------- | ----- | --------- | ------------- | ------------ |
|          |       |           |               |              |
