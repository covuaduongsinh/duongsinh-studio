# Nhật ký đợt T: tinh hoa cho harness của Dương Sinh Studio (14/11/2026)

Kế hoạch gốc: `docs/plans/2026-11-14-studio-tinh-hoa-T.md` (mục 11 "Tiến độ"). Bản rà soát sau đợt:
`docs/plans/research/2026-11-15/KE-HOACH-S-hoan-thien-sau-T.md`; việc hoàn thiện là đợt S
(`docs/plans/2026-11-15-studio-hoan-thien-S.md`). Chỗ lệch so với upstream: `docs/chenh-lech-upstream.md` §59–§69
(đợt S nối tiếp ở §70 trở đi). Nhật ký này chỉ gom lại để phiên sau không phải đọc lại 13 PR.

## 1. Các PR của đợt T

| Bước      | PR   | Nội dung chính                                                                                                                        | Chỗ lệch                                        |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| T0        | #121 | Kế hoạch và số nền                                                                                                                    | §3 của kế hoạch: bốn số nền "chưa đo được"      |
| T2        | #122 | Kiểm chứng suy kết quả từ `exitCode`, từ chối `headSha` cũ, CI đỏ thì `contradicted`; sửa lỗi tiêu chí `ci` so `success` với `passed` | §59                                             |
| T1.0      | #123 | Ghi `ciFailed` vào `ds_autopilot_events`; `wakeIssue()` gọi `wake()` ngoài hook                                                       | §60                                             |
| T1.1–T1.2 | #124 | Bảng `dsReactionRules`/`dsReactionAttempts`, `server/reactions/service.ts`, bốn nguồn sự kiện                                         | §60                                             |
| T1.3–T1.5 | #125 | `prLineComment` từ phiếu review, skill `ds-workflow` bản 5, route và giao diện quy tắc                                                | §60                                             |
| T10       | #126 | Mức việc (nhỏ, chuẩn, nhạy cảm), tự nâng không tự hạ                                                                                  | §61                                             |
| T3a, T3b  | #131 | Đọc hàng rào nhánh chính; `autoMergeOnGithub` chỉ bật khi hàng rào xanh                                                               | §62                                             |
| T9        | #133 | Chính sách thuê bao và đối chứng (tài liệu)                                                                                           | `docs/chinh-sach-thue-bao.md`                   |
| T4        | #137 | Bộ quy tắc trong kho mã (`.nb-studio/harness/`)                                                                                       | §63                                             |
| T5        | #129 | Mẫu `ds-ui-smoke` chạy trên Actions                                                                                                   | §64                                             |
| T7        | #130 | Thẻ "Thay đổi" và "Xin sửa"                                                                                                           | §65                                             |
| T13       | #132 | Thẻ "Hạn mức" và "Cấu hình hiệu lực"                                                                                                  | §66                                             |
| T6        | #135 | Việc định kỳ (bốn mẫu, tắt sẵn)                                                                                                       | §67                                             |
| T11       | #136 | Tìm nhật ký, chạy tiếp từ một bước, biến bước thành bài học                                                                           | §68                                             |
| T12       | #138 | Hai phương án, chỉ khi bấm                                                                                                            | §69                                             |
| T8        | #134 | Drop-in systemd và `audit.sh` cho runner                                                                                              | `docs/runner-resource-limits-proposal.md` mục 7 |

Hai PR sửa test sau đợt: #139, #140.

## 2. Những chỗ đợt T làm khác kế hoạch (đáng nhớ nhất)

- Không có lệnh `verify run`: CLI của plugin agents chỉ là route, nên thay bằng `verify plan` cộng từ chối phía server và `contradicted` (§59).
- Phản ứng tự động chỉ chạy khi việc ở `in_progress`, trần 5 tính theo từng loại sự kiện, leo thang chỉ vào Hộp thư, và không lấy
  dòng cuối log của job (§60). Ba điều đầu đã sửa ở S1 (§70).
- Mức việc không thêm trường vào form tạo việc vì form do plugin projects giữ (§61).
- Hàng rào nhánh chính đọc bằng quyền App đang có, không xin Administration (§62).
- Tự merge của GitHub chỉ được gọi sau khi PR đã sẵn sàng nên không bật được; sửa ở S2 (§71).
- Kiểm giao diện chỉ chụp được trang đăng nhập và ảnh chưa hiện ở thẻ "Thay đổi"; sửa phần mã ở S3 (§72).
- Không nhập ngược bài học khi PR merge (§63); S5 làm (§74).
- Việc định kỳ không dùng plugin Scheduler vì lịch ở đó định nghĩa trong mã (§67).

## 3. Chưa thử với hệ thống thật

GitHub thật (đọc hàng rào, auto-merge, phiếu review qua App, workflow `ds-ui-smoke` và `ds-check` có job `verify`), VPS (drop-in
systemd, `audit.sh`, daemon `dump`), production (`studio.dsc.edu.vn`), thông báo đẩy tới thiết bị thật. Kho nháp `covuaduongsinh/ds-sandbox`
(Q2 của đợt S) là điều kiện để thử các việc GitHub.

## 4. Số đo

Bốn số nền của T0 **vẫn chưa đo được**: điểm chuẩn `ds-core`, thời gian từ CI đỏ tới lượt sửa bắt đầu, số lượt PM mỗi việc, tỉ lệ PR merge
không cần người bấm. Cách đo (chỉ đọc) nằm ở mục 3 của kế hoạch T; chủ dự án chạy `ds-studio bench run` trên máy dev và ba truy vấn đọc trên
CSDL production. Từ khi T1.0 chạy, `ds_autopilot_events` có giờ `ciFailed` và (từ S1) `reacted`/`reactionSkipped`, nên số "CI đỏ → lượt sửa" đo được
sau vài ngày chạy thật.

## 5. Việc chủ dự án làm tay (từ kế hoạch T, còn nguyên)

Sao lưu trước khi đưa đợt T lên production (sáu migration `202611140001`–`0006`); tick _Pull request review_ và _Pull request review comment_ ở mỗi
GitHub App; bật bảo vệ nhánh chính theo bốn bước (không bật "bắt buộc người duyệt"); chưa bật "tự merge của GitHub" tới khi thử xong S2; áp drop-in
và chạy `audit.sh` trên VPS; còn treo từ đợt V: daemon job, rclone, token đọc Releases, thử một tag.
