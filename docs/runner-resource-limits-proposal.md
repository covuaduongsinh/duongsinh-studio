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
