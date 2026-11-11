# Prompt triển khai kế hoạch H (harness)

Dán nguyên khối dưới đây vào một phiên mới, sửa dòng "Phiên này làm bước".

```text
Bạn là kỹ sư của Dương Sinh Studio. Báo cáo tiếng Việt; commit message tiếng Anh theo Conventional Commits, không thêm
dòng Co-Authored-By hay attribution nào; commit bằng `git commit -F <file>`; stage theo đường dẫn, không `git add -A`.

VIỆC: triển khai docs/plans/2026-11-10-studio-harness-H.md theo thứ tự H0 → H1a → H1b → H1c → H1d → H4 → H2 → H3a.
Phiên này làm bước: <ghi bước, ví dụ "H0 và H1a">. Dừng sau khi PR của bước đó xanh và mục Tiến độ đã cập nhật.

TRƯỚC KHI SỬA
1. `git status --short --branch`; so HEAD của checkout D:\code\duongsinh-studio với checkout WSL
   (~/code/duongsinh-studio), làm trên bên mới hơn; `git fetch`, tạo nhánh feat/harness-<bước> từ origin/main.
2. Đọc: AGENTS.md, .agents/rules/duongsinh-studio.md, kế hoạch H (cả mục 2 "Cơ chế có sẵn" và mục 5 "Rủi ro"),
   mục Tiến độ của kế hoạch M (docs/plans/2026-11-08-studio-hoan-thien-theo-tai-lieu.md) để biết M4, M5 đang ở đâu.
3. Đọc skill của plugin trước khi viết: .agents/skills/nocobase-app-plugin-agents/,
   .agents/skills/nocobase-app-plugin-projects/, và .agents/skills/nocobase-app-development/SKILL.md (đi theo trang
   tham chiếu đúng việc: server-routes, migrations, testing, system-settings, frontend ui-workflow).
4. Kế hoạch H viết theo main = 3bfc28d. Trước mỗi bước, mở lại các file nó nêu và kiểm số dòng, tên hàm còn đúng; khác
   thì theo mã hiện tại và ghi chỗ khác vào báo cáo.

LUẬT
- Ưu tiên cơ chế plugin (bảng ở mục 2 của kế hoạch H); chỉ tự viết khi plugin không có, và ghi vào
  docs/chenh-lech-upstream.md ở số mục còn trống tại lúc merge.
- Mỗi bước một nhánh, một PR, chỉ merge khi CI xanh. Không trộn với M4, M5: không sửa server/releases/*,
  server/previews/dokploy.ts, server/providers/nb3-apps.ts, deploy/dokploy/*. Route mới ở file mới; giao diện là
  component riêng gắn vào trang bằng một dòng, không đổi bố cục đợt P vừa chốt.
- Migration tự chứa, có `down`, tên export trùng tên file, lấy số kế tiếp tại lúc làm; không sửa
  database/main/collections/.
- Mọi route: `auth.required()`, kiểm quyền, `apiValidator()`, `describeRoute()`, `cliRoute` cho lệnh CLI; test 401, 403
  và thành công.
- Chuỗi người đọc: client/locales/vi-VN.ts trước, en-US.ts và zh-CN.ts đủ cặp.
- Mọi năng lực cấu hình được (Kiểm chứng, Bài học, Playbook, Bộ đo) có bề mặt quản trị thật trong Cài đặt hệ thống.
- Viết test trước, thấy nó đỏ rồi mới viết mã (đợt P đã ghi nhận lỗi viết test sau).
- Kiểm tra theo file: `pnpm exec vitest run <file>`, `pnpm exec eslint <file>`, `pnpm exec prettier --check <file>`.
  Không chạy `pnpm check`, `pnpm test`, `pnpm build` hay `tsc` toàn repo.
- Không in, không commit bí mật; đọc bí mật vào biến, không echo, không `sed`/`cat` file bí mật ra kết quả công cụ.
  Không đụng nocobase.dsc.edu.vn. Không ghi lên production; lên production là bước riêng, chỉ làm khi chủ dự án bảo.
- Thêm điều kiện merge thì thêm vào cả hai đường: bộ đánh giá của tự lái và `stageMergeAllowed`
  (server/autopilot/evaluator.ts).
- Bật `observesIssueChanges`/`observesComments` cho kind agent (H2b) phải kèm test giữ nguyên hành vi đánh thức và rút
  run hiện có.
- H3b cần quyền root trên VPS production: chỉ đo chỉ đọc và đề xuất, rồi HỎI.
- Skill ds-* sửa trong server/agents/builtin-skills.ts phải tăng `revision` (H0), nếu không production không nhận.

XONG MỘT BƯỚC LÀ KHI
- Test của bước đó đã chạy và xanh, dán output thật vào báo cáo; không báo xong khi còn test đỏ, bị bỏ qua hay chưa chạy.
- Đã rà file đổi: không còn TODO giữ chỗ, `test.skip`, `.only`, nhánh chưa hiện thực.
- Mục Tiến độ của kế hoạch H đã tick kèm số PR; chênh lệch đã ghi.
- Báo cáo nêu: đã đổi gì, đã kiểm thế nào và trong phạm vi nào, còn gì chưa kiểm, câu hỏi cần chủ dự án chốt (dùng câu
  hỏi có lựa chọn kèm khuyến nghị).

CÂU HỎI ĐÃ CHỐT (không hỏi lại): N = 2; mọi việc giao agent phải có tiêu chí, tiêu chí agent đề xuất có hiệu lực ngay;
bộ đo chạy trên repo bench riêng, public; ngân sách bộ đo 60 lượt/ngày và tối đa 4 lần đủ bộ mỗi tháng.

CÒN MỞ (hỏi khi tới bước, xem mục 6 của kế hoạch H): Q5 thay hộp thoại "Việc mới" của plugin; Q6 nguồn và đích của
!nhap-lark; Q7 quyền root cho H3b; Q8 khoá chỉ đọc để đối chiếu DS-57…DS-60 trên production (hỏi trước khi bắt đầu H1).
```
