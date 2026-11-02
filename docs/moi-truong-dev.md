# Môi trường phát triển Dương Sinh Studio

Cập nhật: 01/11/2026 (giai đoạn S0).

## Máy dev

| Thành phần       | Giá trị                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hệ điều hành     | Windows 10 Pro + WSL2 Ubuntu 24.04.4                                                                                                                                                       |
| CPU              | Intel Pentium Gold G6405 — **không có AVX/AVX2** (xem mục Bẫy)                                                                                                                             |
| Node.js (WSL)    | 24.14.1 (`/usr/bin/node`)                                                                                                                                                                  |
| pnpm (WSL)       | 11.x cài vào `~/.local/bin` (`npm install -g pnpm@11 --prefix ~/.local`); dự án ghim `packageManager: pnpm@11.7.0`. `/usr/bin/pnpm` 9.15.9 vẫn còn nhưng bị `~/.local/bin` che trên `PATH` |
| Thư mục làm việc | `~/code/duongsinh-studio` (hệ thống file Linux, tránh I/O chậm của `/mnt/d`)                                                                                                               |
| Bản sao Windows  | `D:\code\duongsinh-studio` (mirror bằng git)                                                                                                                                               |

## Chạy

```bash
cd ~/code/duongsinh-studio
pnpm dev            # http://127.0.0.1:13100/main/ (cổng đặt trong .env: APP_SERVER_PORT=13100)
```

- Cổng 13100 để tránh 13000/13001 của NocoBase 2 dev.
- `.env` và `config.yml` nằm trong `.gitignore`. Tạo lại trên máy mới:
  `printf 'APP_SERVER_PORT=13100\n' > .env && pnpm nocobase config init --dialect sqlite --json && pnpm nocobase config set client.app.title="Dương Sinh Studio" --json`.
- Tài khoản đầu tiên lấy từ `users.initialAdmin` trong `config.yml`. **Đổi mật khẩu mặc định** trước khi mở ra ngoài máy.
- Truy cập từ trình duyệt Windows: `http://127.0.0.1:13100/main/` (WSL2 chuyển tiếp localhost).

## Runner cá nhân trong WSL (S2, 01/11/2026)

- Coding tool cài vào `~/.local` (không sudo): `npm install -g @anthropic-ai/claude-code @openai/codex --prefix ~/.local`.
  Chủ dự án tự đăng nhập trong terminal Ubuntu: `claude auth login --claudeai` (gói Max) và `codex login --device-auth`
  (ChatGPT). Kiểm tra: `claude auth status`, `codex login status`. Thông tin đăng nhập nằm ở `~/.claude/`, `~/.codex/`.
- Tarball do app tự build, đặt ở `storage/runners/dist` (gitignored, không commit):
  `pnpm nocobase cli build --universal` (CLI `ds-studio`) và `pnpm nocobase cli build --runner --universal`
  (`nocobase-runner`, cần devDependency `@nocobase/agent-runner`). Bản universal chạy bằng Node 24 có sẵn.
- Cài runner: giải nén tarball runner vào `~/.local/opt/nocobase-runner`, symlink `~/.local/bin/nocobase-runner`.
- Đăng ký (token một lần, 10 phút, không in ra chat, ghi vào file `*.secret` rồi xoá):
  `pnpm nocobase agents runner-token --trust ownerOnly --owner <userId> --tools claude,codex --json` →
  `nocobase-runner register --server http://127.0.0.1:13100/main --token <token> --name may-dev-duongsinh`.
- Chạy: `nocobase-runner start` (tự thành daemon; log ở `~/.nocobase-runner/logs/runner.log`), xem `nocobase-runner status`.
  Runner là **cá nhân** (`ownerOnly`): chỉ nhận việc do chủ của nó khởi động. Agent có toàn quyền trên home WSL: runner
  không phải sandbox.
- Agent đã bật (chủ dự án chọn): Claude Opus 5.5 (approach, review, điều tra khó) và Claude Sonnet 5.5 (dev chính), tạo bằng
  `POST /api/agents/runnerAgents` kèm mô tả "giỏi việc gì" tiếng Việt. Chưa bật Codex, nên review chéo khác nhà cung cấp
  chưa có.

## Sessions trên máy của mình (tuỳ chọn, S4)

Trang **My agents** (`/agent-sessions`) chạy coding agent (Claude Code, Codex…) **trên máy của chính người dùng** qua
Agent Client Protocol. Chưa cài trên máy nào; khi chủ dự án muốn dùng, tự chạy trên máy đó (cần `ds-studio` đã đăng nhập):

```bash
ds-studio login --server http://127.0.0.1:13100/main   # đăng nhập thiết bị, duyệt trong trình duyệt
ds-studio acp start                                     # nối máy, chạy trong terminal này
# hoặc giữ kết nối nền từ mỗi lần đăng nhập (Windows: script trong Startup, Linux: systemd user unit):
ds-studio acp service install
ds-studio acp service status
ds-studio acp service uninstall                         # gỡ
```

Agent của session chạy với quyền của chính người đó trên máy, chỉ trong các thư mục cho phép ở hộp thoại "My computers".
Khác với **Ask agent** (nút trên trang issue/project và panel chat ⌘J): Ask agent chạy trên **runner** như mọi run khác.

## Bẫy đã gặp

0. **`vite build` hết heap (SIGABRT).** Sau S2, bundle client vượt trần heap mặc định ~2 GB của Node (`FATAL ERROR:
Ineffective mark-compacts near heap limit`), nặng thêm vì Rollup chạy bản WebAssembly. Cách xử lý:
   `nodeOptions: --max-old-space-size=4096` trong `pnpm-workspace.yaml`. Lưu ý: pnpm 11 **không** đọc `node-options` từ
   `.npmrc` (`pnpm config get node-options` ra `undefined`). Máy chạy build (dev, CI, Docker) cần ≥ 6 GB RAM.

1. **Rollup native chết vì `SIGILL`.** `@rollup/rollup-linux-x64-gnu@4.67.3` dùng lệnh AVX, CPU dev không có, làm Vite thoát
   (`[client] exited unexpectedly; code=null signal=SIGILL`). Cách xử lý: `overrides.rollup: npm:@rollup/wasm-node@^4.67.3`
   trong `pnpm-workspace.yaml`. Bản WebAssembly cùng API, chậm hơn một chút khi build. Chỉ bỏ override khi mọi máy
   cài app (dev, runner VPS, CI) đều có AVX2. Cách kiểm tra nhanh: `grep -qw avx2 /proc/cpuinfo && echo ok`.
   esbuild, lightningcss, tailwind oxide, better-sqlite3 đều nạp được trên CPU này (đã thử từng addon).
2. **`pkill -f duongsinh-studio`** trong `wsl -e bash -lc '…'` khớp luôn chính shell đang chạy và tự kill nó. Muốn dừng dev
   thì dừng tiến trình `pnpm dev` cha, hoặc lọc PID cụ thể.
3. Gọi heredoc qua PowerShell → `wsl bash -lc` hỏng trích dẫn. Sửa file bằng công cụ chạy trong WSL hoặc qua đường dẫn
   `\\wsl.localhost\Ubuntu\home\duongsinh\code\duongsinh-studio\…`.
