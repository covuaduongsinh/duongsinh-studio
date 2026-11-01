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

## Bẫy đã gặp

1. **Rollup native chết vì `SIGILL`.** `@rollup/rollup-linux-x64-gnu@4.67.3` dùng lệnh AVX, CPU dev không có, làm Vite thoát
   (`[client] exited unexpectedly; code=null signal=SIGILL`). Cách xử lý: `overrides.rollup: npm:@rollup/wasm-node@^4.67.3`
   trong `pnpm-workspace.yaml`. Bản WebAssembly cùng API, chậm hơn một chút khi build. Chỉ bỏ override khi mọi máy
   cài app (dev, runner VPS, CI) đều có AVX2. Cách kiểm tra nhanh: `grep -qw avx2 /proc/cpuinfo && echo ok`.
   esbuild, lightningcss, tailwind oxide, better-sqlite3 đều nạp được trên CPU này (đã thử từng addon).
2. **`pkill -f duongsinh-studio`** trong `wsl -e bash -lc '…'` khớp luôn chính shell đang chạy và tự kill nó. Muốn dừng dev
   thì dừng tiến trình `pnpm dev` cha, hoặc lọc PID cụ thể.
3. Gọi heredoc qua PowerShell → `wsl bash -lc` hỏng trích dẫn. Sửa file bằng công cụ chạy trong WSL hoặc qua đường dẫn
   `\\wsl.localhost\Ubuntu\home\duongsinh\code\duongsinh-studio\…`.
