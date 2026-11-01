# Chênh lệch giữa gói đã publish và tài liệu/kế hoạch

Ghi lại mỗi lần gói `@nocobase/*@beta` lệch với README đã đọc hoặc với kế hoạch
(`D:\code\nocobase\docs\plans\2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`).
Mốc đối chiếu nguồn: `upstream/v3-develop` commit `04922adec1` (2026-10-31).

## Phiên bản đã lắp (S0, 01/11/2026)

| Gói                                   | Phiên bản     | Trạng thái trong app                                                  |
| ------------------------------------- | ------------- | --------------------------------------------------------------------- |
| `@nocobase/create-app`                | 0.1.0-beta.34 | tạo app từ `app-template-default` 1.0.0-beta.86                       |
| `@nocobase/app-plugin-agents`         | 2.0.0-beta.1  | đăng ký server + client + cli                                         |
| `@nocobase/app-plugin-agent-sessions` | 1.0.0-beta.15 | đăng ký server + client                                               |
| `@nocobase/app-plugin-knowledge`      | 0.1.0-beta.16 | đăng ký server + client (template đã có `server/config/knowledge.ts`) |
| `@nocobase/app-plugin-releases`       | 0.1.0-beta.16 | đăng ký server + client; section cấu hình do app tự khai báo          |
| `@nocobase/app-plugin-projects`       | 0.1.0-beta.23 | **cài, chưa bật** (`plugin register --disabled`), xem mục 1           |

`@nocobase/app-cli-client` 0.1.0-beta.17 đã cài (devDependencies), làm CLI riêng `ds-studio` (xem mục 4).
Gói lib `app-host` 0.1.0-beta.18, `acp-bridge` 1.0.0-beta.4, `agent-protocol` 0.1.0-beta.16, `agent-runner`
0.1.0-beta.22 đều đã có trên npm. Chưa cài; sẽ lắp ở giai đoạn dùng đến (S2 runner, S4 ACP bridge, S5 host).

## 1. Projects bắt buộc app bind `projectsAccessToken`

Bật plugin mà không bind thì server dừng khi boot: `Service "@nocobase/app-plugin-projects/access" is not registered`.
Skill của plugin xác nhận plugin không giữ vai trò riêng; app phải cung cấp `ProjectsAccess` (`permissionsOf`, `admit`,
`changed`, `administrators`, tuỳ chọn `permissionsOfUser`). Trên `v3-develop`, chỉ test helper của plugin có bản bind
mẫu; phần này thuộc lớp đóng của Studio thương mại.

Quyết định: không viết bản tạm cấp mọi quyền (vi phạm luật "Visible and manageable role assignments" trong `AGENTS.md`).
Projects bật ở **đầu S1**, cùng `server/providers/projects-access.ts` ánh xạ Permission Sets (seed `pm-*`) sang
`Permissions` và 3 vai trò owner/admin/contributor.

## 2. Releases không xuất factory cấu hình

README yêu cầu section `releases` (`artifact`, `dataDir`), nhưng gói không có `defineReleasesConfig` như knowledge, nên
`pnpm nocobase config set releases.*` báo `UNKNOWN_KEY`. Cách làm: app tự khai báo `server/config/releases.ts` bằng
`defineAppConfig` (kiểu `ReleasesPluginConfig` từ `@nocobase/app-plugin-releases/server`) và thêm vào
`server/config/index.ts`. Archive nằm trên disk `local` (private), prefix `release-artifacts`; `dataDir` là
`storage/releases`. Host in-process/Docker để tắt tới S5. `releasesAccessToken` chưa bind nên "mọi người không có quyền
gì": an toàn cho tới S5.

## 3. Cảnh báo không chặn

- Agents 2.0.0-beta.1 khai báo `queue.jobs` đã bị bỏ qua ("Job modules are no longer discovered"). Lỗi phía thượng nguồn,
  chỉ là cảnh báo. Theo dõi khi nâng phiên bản.
- `better-auth` chưa có `baseURL`: đặt `app.publicOrigin` khi triển khai thật.
- Jobs chạy cấu hình memory: cần `jobs.default` redis khi chạy nhiều tiến trình (production).

## 4. Agent Sessions client bắt buộc tên CLI của app

`plugin register` ghi `agentSessions()` không tham số. Server vẫn boot và `curl` trang chủ vẫn trả 200, nhưng client ném
lỗi ngay khi nạp plugin: `agentSessionsRoute() needs the application’s command line, such as { cli: "acme" }`. Chỉ
4 file test client (`client-plugin-registry`, `client-runtime`, `foundation-integration`, `tailwind-sources`) bắt được.
Bài học: kiểm chứng giao diện phải chạy test client hoặc mở trình duyệt, không chỉ `curl`.

Cách làm: khai báo `nocobase.cli` trong `package.json` (`bin: ds-studio`, `displayName: Dương Sinh Studio`,
`envPrefix: DS_STUDIO`, nên CI dùng được `DS_STUDIO_API_KEY`), cài `@nocobase/app-cli-client`, chạy
`pnpm nocobase cli link`, và truyền `agentSessions({ cli: 'ds-studio' })`. Đăng nhập thiết bị (`auth.clientId`) và
`skills` giao kèm runner để đến S2.
