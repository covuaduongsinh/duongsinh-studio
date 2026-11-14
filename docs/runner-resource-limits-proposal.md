# Đề xuất cấu hình giới hạn tài nguyên và an toàn mạng cho Runner (H3b)

Tài liệu thực hiện bước **H3b** theo kế hoạch `docs/plans/2026-11-10-studio-harness-H.md`.

---

## 1. Hiện trạng runner trên VPS production

Runner của Dương Sinh Studio trên VPS production (`217.15.160.118`) đang được quản lý bởi systemd slice:

- **Tên slice**: `user-1002.slice` (chạy dưới `uid 1002`, user `studio-runner`).
- **Giới hạn tài nguyên hiện có**:
  - `MemoryMax=2.5GiB`
  - `MemorySwapMax=512MiB`
  - `CPUQuota=300%` (3 cores)
- **Mạng**: Hiện tại **chưa có giới hạn outbound**, runner có thể kết nối ra bất kỳ IP/domain nào nếu lệnh yêu cầu.

---

## 2. Kết quả đo đạc và quan sát

1. **Bộ nhớ RAM**:
   - Các bài test và quy trình build (`pnpm build --target linux-x64`, `pnpm test`) đạt đỉnh RAM dao động từ **1.6 GiB đến 1.9 GiB**.
   - Mức đỉnh này khá tiệm cận ngưỡng `MemoryMax=2.5GiB`.
   - Khi không có ngưỡng cảnh báo, nếu vượt quá 2.5GiB, Linux kernel OOM-killer sẽ lập tức gửi tín hiệu `SIGKILL` tiêu diệt tiến trình runner, dẫn đến run bị đứt gãy đột ngột mà không kịp để lại log kết thúc (Hành vi sai #3 trong kế hoạch H).

2. **Các đích mạng thiết yếu của runner**:
   Qua phân tích các tác vụ của Studio, runner chỉ cần giao tiếp với đúng 5 dịch vụ/domain:
   - `registry.npmjs.org` (HTTPS, cổng 443): Cài đặt/cập nhật thư viện qua npm/pnpm.
   - `github.com` & `api.github.com` (HTTPS, cổng 443; run dùng token GitHub App qua HTTPS, 1 giờ, nên **không** cần SSH cổng 22): Thao tác git clone, fetch, push và kiểm tra PR.
   - `api.anthropic.com` (HTTPS, cổng 443): Giao tiếp mô hình Claude LLM cho các lượt chạy và review.
   - `open.larksuite.com` (HTTPS, cổng 443): Đồng bộ dữ liệu bảng cơ sở Lark Base.
   - `studio.dsc.edu.vn` (HTTPS, cổng 443): Kết nối lại API nội bộ của Dương Sinh Studio.

---

## 3. Đề xuất cấu hình an toàn

### 3.1. Thêm `MemoryHigh` để chống chết sốc

- **Cấu hình đề xuất**:
  - Giữ nguyên `MemoryMax=2.5GiB`, `MemorySwapMax=512MiB`, `CPUQuota=300%`.
  - Bổ sung: `MemoryHigh=2.0GiB`.
- **Tác dụng**:
  - Khi bộ nhớ của tiến trình runner vượt quá 2.0 GiB, systemd và kernel cgroup v2 sẽ bắt đầu ép thu hồi bộ nhớ cache và làm chậm (throttle) việc cấp phát tài nguyên cho tiến trình thay vì lập tức gửi `SIGKILL`.
  - Điều này giúp tác vụ nặng có thời gian giải phóng bớt bộ nhớ hoặc kết thúc an toàn, tránh bị hủy đột ngột.

### 3.2. Giới hạn mạng bằng Proxy Allowlist

- Runner hỗ trợ nhận các biến môi trường proxy (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`).
- Định tuyến lưu lượng ra Internet của `uid 1002` qua proxy lọc domain (chỉ cho phép 5 domain thiết yếu trên).
- Chặn mọi kết nối đi trực tiếp ra ngoài đối với user `uid 1002` (chỉ cho phép đi qua cổng proxy localhost).

---

## 4. Hướng dẫn áp dụng trên VPS (Cần quyền root)

> [!IMPORTANT]
> Bước này **chỉ thực hiện khi có sự đồng ý của chủ dự án** (xem mục 6).

### Bước 1: Tạo drop-in cấu hình cho `user-1002.slice`

```bash
sudo mkdir -p /etc/systemd/system/user-1002.slice.d/
cat <<'EOF' | sudo tee /etc/systemd/system/user-1002.slice.d/override.conf
[Slice]
MemoryHigh=2.0G
MemoryMax=2.5G
MemorySwapMax=512M
CPUQuota=300%
EOF
```

### Bước 2: Nạp lại cấu hình systemd

```bash
sudo systemctl daemon-reload
```

### Bước 3: Kiểm tra cấu hình có hiệu lực

```bash
systemctl show user-1002.slice | grep -E 'MemoryHigh|MemoryMax|MemorySwapMax|CPUQuota'
```

---

## 5. Quy trình hoàn tác (Rollback)

Nếu sau khi áp dụng xuất hiện sự cố hoặc runner bị chậm bất thường, hoàn tác về trạng thái ban đầu chỉ bằng 2 lệnh:

```bash
sudo rm -f /etc/systemd/system/user-1002.slice.d/override.conf
sudo systemctl daemon-reload
```

---

## 6. Câu hỏi gửi Chủ dự án

- **Câu hỏi**: _Anh có đồng ý áp dụng cấu hình `MemoryHigh=2.0GiB` trên VPS `217.15.160.118` cho `user-1002.slice` không?_
- **Tác động**: Không gây gián đoạn dịch vụ Studio (không cần restart VPS hay container chính); có quy trình rollback lập tức nếu cần.

---

## 7. Bản hoàn chỉnh (đợt T, bước T8)

Các tệp dưới đây thay cho đoạn lệnh ở mục 4. **Chủ dự án tự áp dụng trên VPS; phiên nào của agent cũng không SSH hay ghi lên VPS.**

| Tệp                                            | Cài vào                                                                  | Làm gì                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/runner/ds-runner-slice.conf`           | `/etc/systemd/system/user-1002.slice.d/ds-runner.conf` (root)            | `MemoryHigh=2.0G` cùng ba giới hạn cũ; chặn runner vào các dải mạng riêng (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `100.64/10`, `fc00::/7`, `fe80::/10`), mở loopback; Internet công cộng vẫn mở |
| `deploy/runner/nocobase-runner-hardening.conf` | `~/.config/systemd/user/nocobase-runner.service.d/hardening.conf` (user) | `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict` với `ReadWritePaths=%h`, và vài `Protect*` khác                                                                                                   |
| `deploy/runner/audit.sh`                       | chạy bằng user runner (`su - studio-runner`, `bash audit.sh`)            | Báo **đỏ** khi user này đọc được bí mật của Studio, thư mục Dokploy, socket Docker, socket `ds-nb3-exec` hoặc thư mục sao lưu; không in nội dung, không đổi gì                                            |

Vì sao không có danh sách miền cho phép: `IPAddressAllow` chỉ nhận địa chỉ IP, mà địa chỉ của GitHub, npm và nhà cung cấp mô hình
đổi theo thời gian; chặn nhầm sẽ làm runner hỏng giữa lượt. Chặn các dải riêng là phần có lợi mà không phụ thuộc danh sách đó.

Cách làm, từng bước (mỗi bước có hoàn tác):

1. Chạy `audit.sh` trước khi đổi gì, ghi kết quả (đỏ ở đâu).
2. Cài tệp slice (root), `systemctl daemon-reload`, `systemctl show user-1002.slice | grep -E 'MemoryHigh|IPAddress'`.
3. Cài tệp hardening (user), `systemctl --user daemon-reload && systemctl --user restart nocobase-runner`; chạy **một** lượt thử.
   Nếu log lượt đó có `Read-only file system` hay `Operation not permitted`, ghi đường dẫn ra rồi thêm vào `ReadWritePaths=`
   hoặc xoá tệp để hoàn tác.
4. Chạy lại `audit.sh`; mục tiêu là không còn dòng đỏ. Phần đỏ do quyền tệp (ví dụ `config.yml` đọc được bởi mọi người) sửa bằng
   `chmod`/`chown` của chủ dự án, không phải bằng drop-in.
5. Hoàn tác: xoá hai tệp, `daemon-reload` (và `--user` cho tệp thứ hai), khởi động lại runner.

**Chưa kiểm trên VPS**: cú pháp và nội dung được test (`tests/project/runner-audit.test.ts`), nhưng tác dụng thật của `ProtectSystem=strict`
và `IPAddressDeny` trong một `systemd --user` chưa được thử; cần thử trên máy dev có systemd trước khi áp dụng cho VPS. Không dùng Docker
cho từng lượt (không đủ RAM).
