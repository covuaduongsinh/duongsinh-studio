# Prompt triển khai đợt P (demo L2)

> Dán toàn bộ phần dưới vào một phiên Claude Code mới mở trong WSL (`cd ~/code/duongsinh-studio && claude`). Kế hoạch: `2026-11-10-studio-hoan-thien-theo-demo-l2.md`.

Bạn là kỹ sư triển khai đợt P của Dương Sinh Studio (ứng dụng NocoBase 3). Trả lời và báo cáo bằng tiếng Việt; code, lệnh,
đường dẫn, commit message giữ tiếng Anh (Conventional Commits, KHÔNG thêm Co-Authored-By hay dòng ghi công nào).

## Nhiệm vụ

Thực hiện kế hoạch docs/plans/2026-11-10-studio-hoan-thien-theo-demo-l2.md, lần lượt P0 → P0b → P1 … P9, để Studio khớp ảnh demo trong
"docs/pictures/demo nocostudio L2/" (Screenshot_11…59.png). Các quyết định Q1–Q4 ở mục 2 đã chốt, không hỏi lại.

## Bối cảnh cần đọc trước

1. AGENTS.md, .agents/rules/duongsinh-studio.md, .agents/rules/shell.md, .agents/rules/components.md
2. Kế hoạch đợt P (toàn bộ), nhất là bảng đối chiếu mục 3
3. .agents/skills/nocobase-app-development/SKILL.md và trang frontend/ui-workflow.md; skill
   nocobase-app-plugin-agent-sessions trước P4; nocobase-app-plugin-agents trước P5/P8
4. Ảnh demo của bước đang làm (đọc bằng Read) — mỗi bước mở lại đúng các ảnh ghi trong bảng
5. docs/chenh-lech-upstream.md (số mục kế tiếp: §34)
6. docs/plans/research/2026-11-10/dac-ta-demo-rea.md — hợp đồng API của demo do REA bắt được; đây là nguồn chuẩn cho tên
   trường và tham số. Khi thiếu trường, dùng REA bắt lại (skill reverse-engineer-anything, capture_browser_scenario ở chế độ
   launch, chỉ đọc: không bấm Merge/Save/Delete/Create/Send trên demo), không đoán.
7. Craft Anything (D:\code\craft-anything, README): chỉ dùng chế độ Clean room để chụp/so bố cục; KHÔNG dùng rebuild sinh mã.

## Luật làm việc (bắt buộc)

1. Làm trong WSL: cd ~/code/duongsinh-studio && claude. Không điều khiển WSL qua wsl.exe.
2. P0 phải xong trước mọi việc khác. Phần đang dở nằm ở D:\code\duongsinh-studio (main 07c57ab, chưa commit): nếu nhánh
   feat/demo-l2-wip chưa có trên origin, DỪNG và hướng dẫn chủ dự án chạy ở Windows: tạo nhánh, git add từng đường dẫn,
   commit, push main và nhánh. Trong WSL: git status trước; nhánh feat/github-app-labels-secrets có thay đổi chưa commit
   thì hỏi chủ dự án; không reset --hard, không clean.
3. Mỗi bước một nhánh feat/p<N>-<slug>, một PR, CI xanh mới gộp. git add theo đường dẫn, không -A. Không commit symlink
   hay node_modules. Commit bằng git commit -F <file>.
4. Viết test trước (tests/, không đặt cạnh mã nguồn), bắt đầu trang từ tests/client/page-harness.test.tsx.
5. Kiểm tra theo phạm vi tệp đã đổi; KHÔNG chạy pnpm check / pnpm test / pnpm build / tsc toàn repo. Máy dev 12 GB RAM:
   không chạy test server khi dev server đang chạy; lệnh nặng chạy foreground với timeout tường minh; dùng exit code thật.
6. Route mới: camelCase, { data }, ApiError, apiValidator(), describeRoute(), auth.required() + kiểm quyền, middleware chỉ
   gắn vào đường dẫn của mình. Migration mới tự chứa, có down, không sửa migration đã gộp.
7. Mọi chuỗi qua khóa dịch ở client/locales/vi-VN.ts, en-US.ts, zh-CN.ts (không sửa locales/system/); chạy locale-parity.
8. Chỉ dùng shadcn/ui và token màu ngữ nghĩa; thiếu primitive thì yes n | pnpm exec shadcn add <tên>, sau đó git diff
   package.json và khôi phục phiên bản @nocobase/* nếu bị hạ.
9. Trang của plugin: không khai báo lại route, không viết lại; chỉ option, component override đã đăng ký, hoặc overrides
   bản dịch. Chênh lệch ghi vào docs/chenh-lech-upstream.md.
10. Không đổi id trang/quyền, không cấp quyền cho authenticated:* hay nới vai trò member.
11. Giữ thương hiệu Dương Sinh; không làm Demo Mode, License, chuyển tài khoản demo.
12. Hỏi chủ dự án (câu hỏi có lựa chọn, kèm khuyến nghị) trước: mọi lần cập nhật production, mọi thao tác xoá/ghi đè,
    mọi quyền ngoài (GitHub, Dokploy, Google).
13. Trước khi báo xong một bước: dùng skill superpowers:verification-before-completion; không còn TODO, test.skip, stub.

## Cách làm từng bước

Đọc ảnh của bước → đọc mã liên quan → test đỏ → server → client → i18n → kiểm tra theo phạm vi → pnpm dev và so trực tiếp
với ảnh (URL "Local:" in ra) → thử bằng tài khoản chỉ có ds-contributor → commit → PR → đánh dấu "Tiến độ" trong kế hoạch →
báo cáo ngắn → sang bước kế. Thay đổi cấu trúc khung (P7) phải có chú thích lý do và cập nhật .agents/rules/shell.md.

## Báo cáo cuối

Bảng P0–P9: trạng thái, PR, test đã chạy (phạm vi), điều chưa kiểm chứng; danh sách chênh lệch mới ghi vào
chenh-lech-upstream.md; việc cần chủ dự án quyết định; nhắc chạy ở Windows: git -C D:\code\duongsinh-studio pull.
