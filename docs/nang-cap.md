# Nâng cấp NocoBase cho Dương Sinh Studio

Quy trình nâng template và gói `@nocobase/*@beta`. Nguồn chuẩn là skill
`.agents/skills/nocobase-app-upgrade/SKILL.md`; file này chỉ ghi những gì riêng của Studio. Lần áp dụng đầu: beta.86 → beta.88
(U1, 06/11/2026).

## Trình tự

1. **Đọc trước khi gõ:** skill upgrade, rồi `AGENTS.md`, `README.MD` của bản TARGET và skill upgrade trong đúng bản
   `@nocobase/app-skills` mà TARGET khai báo (bản này có thể yêu cầu thêm việc mà skill đang cài chưa biết; beta.88 đòi gộp
   cấu trúc System settings mới). CHANGELOG từng gói nằm trong `node_modules/@nocobase/*/CHANGELOG.md` sau khi cài; xem trước trên npm.
2. **Nhánh:** cây sạch, `git checkout -b template-upgrade-<target>`. Không `checkout --`, `restore`, `reset --hard`, `stash`, `clean`.
3. **Phân loại:** `npm pack` BASE và TARGET ra thư mục tạm **ngoài repo**, `diff -rq`, rồi xếp từng file thành
   untouched / modified / gone. File untouched lấy bản TARGET (kiểm lại ngay trước khi ghi đè); file modified hợp nhất bằng tay.
4. **Phụ thuộc:** chỉ đổi những dải mà BASE → TARGET đổi, cộng các plugin Studio ghim riêng (agents, agent-sessions, projects,
   releases, agent-runner, app-cli-client). Sau `pnpm install`, `pnpm dedupe`, `pnpm nocobase skills sync`: `git diff package.json`.
5. **Mốc so sánh:** khi test đỏ hoặc chậm, dựng `git worktree` của commit cũ, `pnpm install --frozen-lockfile` và chạy đúng test đó
   để phân biệt hồi quy với lỗi có sẵn, không đoán.
6. **DB:** dump production (chỉ đọc), khôi phục vào Postgres cục bộ, chạy theo thứ tự `db repair --dry-run` → `db apply --dry-run` →
   `db apply`, so số dòng từng bảng và index trước/sau. Đọc mã mọi migration đang chờ; ghi lại cái nào `irreversible` và có thực sự
   chạy không (`shouldRun`).
7. **Cổng kiểm tra:** lint, typecheck, `locales check`, test 3 nhóm, build, e2e, duyệt các trang trên dev. Chạy thử bản `dist/`
   trên bản sao production với `SECRETS_KEYS` giả và autopilot đã tắt trong bản sao, đo thời gian khởi động và RAM.
8. **Chốt:** chỉ khi mọi thứ xanh mới đổi `nocobase.defaultTemplateVersion`. Merge vào `main`, push.
9. **Production:** theo `docs/trien-khai-vps.md`: tạm dừng tự lái → sao lưu → build → tải lên → đổi `STUDIO_RELEASE` → kiểm tra → nâng
   runner (sau server) → bật lại tự lái → ca thật trên Sandbox.

## Bẫy trên máy dev

- **Test chạy lâu vượt 10 phút:** chạy theo từng file, tiếp tục được khi bị ngắt, không chạy gộp cả thư mục `tests/server`.
- **`pnpm test:e2e` báo xanh nhưng cả 9 test bị skip** khi thiếu `APP_URL`, `E2E_USERNAME`, `E2E_PASSWORD`: mã thoát 0 không phải bằng chứng.
  `issue-flow` dùng nhãn tiếng Anh nên dev server phải chạy với `APP_DEFAULT_LOCALE=en-US`.
- **Không có Docker daemon hay sudo trong WSL:** Postgres thử dùng binary `@embedded-postgres/linux-x64` trong thư mục tạm. Bản này không
  có `pg_restore`, nên dump dạng `-Fp --inserts`. Xoá bản dump production khi xong.
- **SSH:** quyền 0777 của khoá trên `/mnt/c` làm OpenSSH của WSL từ chối khoá; gọi `/mnt/c/Windows/System32/OpenSSH/ssh.exe`, đừng chép khoá vào WSL.
- **`SECRETS_KEYS`** có dạng `1:<key>`, không phải JSON.
- **Khởi động dev đầu tiên sau khi đổi phiên bản kernel:** Foundation quét toàn bộ mã nguồn một lần, app chậm khoảng 45 giây và RSS tăng tới
  khoảng 800 MB (`docs/chenh-lech-upstream.md` mục 23).
