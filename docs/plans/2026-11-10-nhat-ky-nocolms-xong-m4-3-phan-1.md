# Nhật ký phiên 10/11/2026: NocoLMS chạy ổn, M4.3 phần 1, bàn giao "nối app NB3 bằng một nút"

Nối tiếp `2026-11-09-nhat-ky-m2-m4-2-nocolms.md`. Không có bí mật nào trong file này.

## Kết quả

| Hạng mục                                                 | Trạng thái                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| NocoLMS `https://nocolms.dsc.edu.vn`                     | Chủ dự án xác nhận đăng nhập được, realtime hết lỗi (sau PR #47 và khởi động lại container)             |
| Studio production                                        | `97a8f12` (đợt "củng cố driver"); PR #46–#48 đã merge                                                   |
| M4.3 phần 1 (PR #49, `98218b5`)                          | Đã merge, CI xanh. **Chưa lên production**                                                              |
| Môi trường/App xem thử `nocolms-preview`, khoá, workflow | **Chưa làm.** Bản ghi A `nocolms-preview.dsc.edu.vn` chủ dự án đã thêm                                  |
| "Nối app NB3 bằng một nút"                               | Đã khảo sát và lập kế hoạch bàn giao; phiên mới đã bắt đầu làm (nhánh `feat/github-app-labels-secrets`) |

## Việc đã làm

1. **Chốt NocoLMS**: chủ dự án đăng nhập được và hết lỗi realtime. Còn lại của M4.2 (tự dừng 30 phút, nút Bật/Dừng, biến chỉ-lần-đầu, khởi động lại sau giải nén lại) giữ nguyên trong Tiến độ.
2. **M4.3 phần 1 – xem thử theo PR cho app NB3** (PR #49):
   - Chủ dự án chọn: GitHub Actions trong repo app dựng `dist`; Studio không build.
   - Thiết kế: một App xem thử cố định mỗi repo (môi trường `preview`, một tên miền, không wildcard, `maxApps` 1), nên một PR mỗi lúc. CI tải archive lên với nhãn bản phát hành `pr=<số>`, `sha=<commit>` (header `X-Release-Labels`, `X-Release-Deploy: true`).
   - Mã: `server/releases/nb3-preview.ts` (`createNb3PreviewHooks`): khi `pull_request` đóng hoặc bị gỡ nhãn `preview`, dừng App xem thử, chỉ khi bản đang chạy có nhãn `pr` đúng số PR đó. Nối qua `server/providers/nb3-apps.ts` (`onWebhookEvent`, `releases.releases.getApp/listReleases/stop` với `releases.system`). Test `tests/server/nb3-preview.test.ts` (4 ca).
   - Tài liệu: `docs/xem-thu-app-nb3.md` (việc chủ dự án làm một lần và workflow mẫu); mục Tiến độ cập nhật.
   - CI: static, test client, test node đều xanh; merge squash.
3. **Hướng dẫn chủ dự án** 7 bước (môi trường `preview`, App `nocolms-preview`, gán repo, khoá API chỉ một App, secret `STUDIO_URL`/`STUDIO_API_KEY`, nhãn `preview`, token Workflows). Chủ dự án thấy lắt nhắt và yêu cầu cải tiến Studio.
4. **Khảo sát "nối app NB3 bằng một nút"** (chỉ đọc) và bàn giao ở `~/.claude/plans/immutable-snacking-dawn.md`. Phát hiện chính:
   - `PUT /:resourceId` và `POST /apps/:appId/ensure` trong `server/routes/builds.ts` chỉ tạo App ở môi trường `external`, không đụng driver dokploy hay `hosts`.
   - Tạo môi trường dokploy cần phiên admin (`rel.environments` manage); sửa `hosts` là đọc-sửa-ghi.
   - `server/git/github.ts` thiếu tạo nhãn và đặt secret Actions (cần sealed box); `REQUIRED_APP_PERMISSIONS` thiếu `secrets`, `issues`, `workflows`.
   - Khoá CI chỉ một App: scope `objects: [appId]`, mức `admin` mới có deploy.
   - **Quyết định của chủ dự án: nâng quyền GitHub App** (Secrets, Issues, Workflows), duyệt lại quyền một lần trên GitHub sau khi PR merge.
5. **Hướng dẫn mở phiên mới** trong WSL (`cd /home/duongsinh/code/duongsinh-studio`, `claude`); chủ dự án đã mở và dán bàn giao.

## Sai sót và lưu ý

- Thử `git push` bằng `http.extraheader` kiểu `bearer` bị từ chối; đúng là `basic base64(x-access-token:<token>)`, không in token.
- Phiên mới chuyển nhánh trong cùng thư mục làm việc; file này viết trong một worktree riêng để không đụng vào đó.
- Khoá API của `ds-studio` không đọc được môi trường (thiếu `rel.environments/read`); việc tạo môi trường/App vẫn do chủ dự án làm trong giao diện cho đến khi có nút "nối app".
- Chưa kiểm: đường dẫn vé tải lên `/api/releases/apps/{appId}/uploadTickets` (lấy từ tài liệu route của plugin; phải so với `/api/swagger` khi chạy thật).

## Còn lại

- "Nối app NB3 bằng một nút" (đang ở phiên mới): `createLabel`, `putSecret`, nâng quyền App, route `onboard`, nút trong `RepositoriesCard`.
- M4.3: báo lỗi build vào Hộp thư và push; tạo môi trường/App xem thử và workflow cho NocoLMS; thử bằng PR có nhãn `preview`.
- Production: đưa hook #49 và các PR sau lên theo `docs/trien-khai-vps.md` khi chủ dự án đồng ý.
- M4.2 còn lại: tự dừng khi rảnh trên Dokploy thật, nút Bật/Dừng (`rel.apps/operate`), biến chỉ-lần-đầu, khởi động lại sau giải nén lại.
- NocoLMS (repo `nocolms`): `describeRoute` cho `/lmsAttachments/*`, action phân quyền riêng cho chứng nhận/thăng cấp, lỗi lint trong `lms.ts`, CI cho PR.
- Chủ dự án: xoay khoá API cá nhân đã lộ; bấm "Tôi đã lưu nó rồi" ở trang app `nocolms`; M5.
