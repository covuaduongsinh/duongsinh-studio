# Đợt S — Hoàn thiện sau đợt T (15/11/2026)

Nguồn: `docs/plans/research/2026-11-15/KE-HOACH-S-hoan-thien-sau-T.md` (viết theo `main` = `51bf763`).
Mã là sự thật: mỗi nhận định dưới đây đã được mở file kiểm lại.

## Kết luận

Cả mười nhận định S1–S10 **đúng với mã** ở `51bf763`; không nhận định nào sai. Một chỗ cần hiểu đúng: câu báo lỗi chép nhầm
("Branch protection is read by people…") có ở **sáu** route chứ không chỉ `run-profile.ts` (xem S6). S1 đã làm (PR `feat/s-1`).
S2 và S3 cần một kho nháp thật (Q2) nên phần thử thật chưa làm được; S4 chờ Q1.

## Bảng kiểm

| #    | Nhận định                                                                                | Kết quả            | Bằng chứng trong mã                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.1 | Việc `in_review` bị bỏ qua mọi phản ứng                                                  | đúng → **đã sửa**  | `server/reactions/service.ts` (bản cũ: `statusKey !== 'in_progress'` → `skipped`)                                                                                                     |
| S1.2 | Bình luận người bị tính vào lượt tự sửa; khoá là `headSha`, trần 2                       | đúng → **đã sửa**  | cùng file: `onHead.length >= rule.maxAttempts` áp cho cả `prLineComment`                                                                                                              |
| S1.3 | Sự kiện bị bỏ qua không để lại dấu                                                       | đúng → **đã sửa**  | `react()` chỉ trả `skipped`, không ghi `ds_autopilot_events`                                                                                                                          |
| S1.4 | Trần 5 tính theo từng loại                                                               | đúng → **đã sửa**  | `store.attemptsFor(issueId, event)` lọc theo `event`                                                                                                                                  |
| S1.5 | Leo thang một lần mỗi (việc, sự kiện), chỉ vào Hộp thư                                   | đúng → **đã sửa**  | `server/providers/reactions.ts`: `idempotencyKey` không có số lần; chỉ kênh `inbox`                                                                                                   |
| S1.6 | Phiếu review rỗng vẫn đánh thức                                                          | đúng → **đã sửa**  | `reviewFromPayload` không xét nội dung; provider không xét bình luận dòng                                                                                                             |
| S2   | `enableAutoMerge` chỉ gọi sau khi `evaluate` đạt; không có `disablePullRequestAutoMerge` | đúng               | `server/autopilot/evaluator.ts:573-588`; `server/git/github.ts` chỉ có `enableAutoMerge`. Việc GitHub từ chối bật cho PR đã clean **chưa thử được** (cần Q2)                          |
| S3   | Script mở trang khi chưa đăng nhập; chưa có artifact trong thẻ "Thay đổi"                | đúng               | `server/setups/ui-smoke-workflow.ts:46` `page.goto` không có bước đăng nhập                                                                                                           |
| S4   | Bản nộp kiểm chứng không có `source`; agent tự khai `exitCode`                           | đúng               | `database/main/migrations/202611110004_ds_verifications.ts` và `202611140001` không có cột `source`                                                                                   |
| S5   | Gói xuất chỉ lấy skill gắn theo dự án                                                    | đúng               | `server/harness-export/service.ts:53` `skills.attached({ scope: 'project' })`; `ds-comment-style` là skill dựng sẵn (`server/agents/builtin-skills.ts:234`)                           |
| S6   | Câu báo lỗi chép nhầm; truy vấn nhật ký quét `ag_run_events`                             | đúng, **rộng hơn** | cùng câu "Branch protection is read by people…" ở `branch-protection.ts` (đúng chỗ), `ui-smoke.ts`, `change-summary.ts`, `effective-config.ts`, `harness-export.ts`, `run-profile.ts` |
| S7   | Mẫu "Thử khôi phục sao lưu" giao cho agent                                               | đúng               | `server/routines/decide.ts:35` khoá `backupRestore`                                                                                                                                   |
| S8   | `audit.sh` không kiểm mạng                                                               | đúng               | `deploy/runner/audit.sh` không có thử kết nối                                                                                                                                         |
| S9   | Chưa có nhật ký đợt T                                                                    | đúng               | không có `docs/plans/2026-11-15-nhat-ky-dot-t.md`                                                                                                                                     |
| S10  | Trạng thái giảm tải hạn mức nằm trong bộ nhớ                                             | đúng               | `server/autopilot/stall.ts:90-92` `quotaThrottles`, `lastQuotaDelays` là `Map` trong tiến trình                                                                                       |

## Các bước

| Thứ tự | Bước                  | Trạng thái                                                              |
| ------ | --------------------- | ----------------------------------------------------------------------- |
| 1      | S1 Phản ứng tự động   | xong, PR `feat/s-1`                                                     |
| 2      | S2 Auto-merge GitHub  | xong mã + test giả (PR `feat/s-2`); **chưa thử thật** (cần kho nháp Q2) |
| 3      | S3 Kiểm giao diện     | mã + test; **chưa chạy thật trên Actions** (cần kho nháp Q2)            |
| 4      | S4 Kiểm chứng trên CI | cách A theo mặc định, tắt sẵn                                           |
| 5      | S5–S10                | theo kế hoạch                                                           |

## Quyết định theo mặc định (chủ dự án uỷ quyền 14/11/2026 "tự quyết theo cách tối ưu")

- Q1 = cách A, tắt sẵn từng dự án. Q2 = chủ dự án tạo `covuaduongsinh/ds-sandbox` từ template beta.89 và nối vào Studio máy dev.
- Q3 = có (bình luận theo dòng khi việc ở `in_review` đưa việc về `in_progress`). Q4 = có (leo thang gửi thêm web push).

## Việc chủ dự án làm tay

1. Tạo kho nháp `covuaduongsinh/ds-sandbox` (private, từ template beta.89) và nối vào Studio máy dev — chặn việc thử thật S2, S3, S5.
2. Sao lưu `pg_dump` Studio trước khi đưa đợt T lên production; tạm dừng tự lái khi phát hành.
3. Tick _Pull request review_ và _Pull request review comment_ ở mỗi GitHub App.
4. Bảo vệ nhánh chính theo bốn bước (không bật "bắt buộc người duyệt"); bấm "Kiểm lại" và báo kết quả.
5. Chưa bật "tự merge của GitHub" cho tới khi S2 được thử thật.
6. `ds-studio bench run`, ba truy vấn đọc ở mục 3 kế hoạch T, thử `deploy/runner/` trên VPS rồi `audit.sh`.
7. Còn treo từ đợt V: daemon job, rclone sao lưu, token đọc Releases, thử một tag.

## Tiến độ

- [x] KIỂM LẠI — bảng trên
- [x] S1 — Phản ứng tự động (PR `feat/s-1`; `chenh-lech-upstream.md` §70)
- [x] S2 — Auto-merge GitHub (PR `feat/s-2`; `chenh-lech-upstream.md` §71; **chưa thử với GitHub thật**)
- [x] S3 (phần mã) — Kiểm giao diện (PR `feat/s-3`; `chenh-lech-upstream.md` §72; **chưa chạy thật trên Actions**, cần kho nháp Q2)
- [x] S4 (phần mã) — Kiểm chứng trên CI, cách A, tắt sẵn (PR `feat/s-4`; `chenh-lech-upstream.md` §73; **job `verify` chưa chạy trên Actions thật**)
- [x] S5 (phần mã) — T4 gói xuất và nhập ngược (PR `feat/s-5`; `chenh-lech-upstream.md` §74; **chưa xuất thử vào dự án thật**, chờ chủ dự án chỉ định)
- [x] S6 + S7 (phần mã) — T11 ô tìm nhật ký; T6 sao lưu qua kênh job (PR `feat/s-6`; `chenh-lech-upstream.md` §75; **S7 là dump + đọc lại danh mục, chưa khôi phục vào CSDL tạm; chưa thử với daemon thật**)
- [ ] S8 + S9 + S10 — runner audit mạng; nhật ký đợt T; lưu giảm tải hạn mức
