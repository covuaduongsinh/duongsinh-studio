# Mời thành viên vào Dương Sinh Studio

Từ 08/11/2026 production **đóng đăng ký công khai** (`disableSignUp: true`): người mới chỉ vào được bằng **lời mời** của owner (hoặc của trưởng dự án,
vào đúng dự án của mình). Studio chưa gửi email (chờ Gmail App Password, M5), nên **liên kết mời được chuyển tay** qua Zalo, email riêng…

## Mời

1. **Cài đặt → Tài khoản và phân quyền → Người dùng → Mời thành viên** (owner), hoặc nút **Mời thành viên** ở đầu trang một dự án (trưởng dự án hoặc owner).
2. Nhập một hoặc nhiều email (mỗi dòng một địa chỉ, hoặc cách nhau bằng dấu phẩy hay khoảng trắng) và chọn các dự án họ sẽ tham gia.
   Owner có thể để trống; trưởng dự án bắt buộc chọn ít nhất một dự án mình phụ trách.
3. Sau khi gửi, hộp thoại hiện **liên kết đăng ký của từng địa chỉ, chỉ một lần**, kèm nút sao chép. Chép ngay và gửi riêng cho người đó.
4. Người được mời mở liên kết (`/main/invite/<mã>`), đặt tên và mật khẩu; tài khoản được tạo và họ vào thẳng các dự án đã chọn.

## Quản lý lời mời đang chờ

Dưới bảng Người dùng có mục **lời mời chưa nhận**: mỗi dòng có thể **gửi lại** (liên kết mới, thêm 7 ngày) hoặc **thu hồi**.
Liên kết hết hạn sau 7 ngày. Mất liên kết thì gửi lại; không có cách xem lại một liên kết đã hiện.

## Họ làm được gì sau khi vào: vai trò của thành viên mới

Lời mời **không mang vai trò**. Quyền của người mới đến từ **vai trò khi vào**, đặt ở **Cài đặt → Tài khoản và phân quyền → Thành viên mới**:

- Chọn một vai trò (không chọn được _owner_) hoặc **Không có vai trò**. Vai trò được gán **một lần**, lúc người đó nhận lời mời; đổi cài đặt sau không động tới người đã vào.
- Không có vai trò thì người mới vào được các dự án được mời nhưng **chưa xem được việc nào** cho tới khi bạn gán vai trò ở Người dùng → sửa. Trang hiện cảnh báo này.
- Trang liệt kê **ai đang giữ vai trò đó** (tên, người bị khóa gạch ngang), để bạn thấy trước vai trò này đang ở tay ai.
- Quyền xem cần `pm.members` đọc; đổi cần `define-roles`. Không phải quyền cấp cho mọi người đăng nhập: mỗi người chỉ nhận vai trò khi chính họ nhận lời mời.

## Đặt lại mật khẩu

Ở **Người dùng**, mỗi dòng có nút **Đặt lại mật khẩu** (cần quyền `reset-password` với người đó):

1. Nhập mật khẩu mới (ít nhất 8 ký tự) hoặc bấm **Tạo ngẫu nhiên** (16 ký tự, bỏ các ký tự dễ nhầm như 0/O, 1/l/I).
2. Giữ ô **Đăng xuất họ khỏi mọi phiên đang mở** (bật sẵn nếu bạn có quyền `revoke-sessions`) khi nghi mật khẩu cũ đã lộ.
3. Bấm **Đặt mật khẩu**. Mật khẩu **vẫn hiện trên màn hình** để bạn sao chép và gửi riêng; đóng hộp thoại là không xem lại được. Mật khẩu cũ không còn dùng được.

Studio chưa có trang "Tài khoản của tôi" để người dùng tự đổi mật khẩu (M2.3): trước đó, hãy dặn họ nhờ bạn đặt lại khi cần.

## Cho người làm kỹ thuật

- Thành phần dùng chung: `client/components/invite-members.tsx` (`InviteMembers`, `PendingInvitations`), bọc `InviteDialog` và `InvitationsSection` của plugin projects.
- Ai thấy nút khớp với server (`POST /api/projects/invitations`): quyền `invite` trên mục `pm.members` (mời vào mọi dự án hoặc không dự án nào), hoặc là trưởng dự án (chỉ dự án đó, bắt buộc chọn).
  Server kiểm lại mọi lần; giao diện chỉ ẩn nút.
- `canUseSetting` của plugin không chịu được `viewer` thiếu `permissions` (lúc `GET /projects/me` đang tải hoặc trả dữ liệu lạ): `useMayInvite` bảo vệ chỗ đó.
- Vai trò khi vào: `client/pages/settings/new-member-role.tsx` (route `settingsNewMemberRole`) trên `GET/PUT /api/access/settings`, `GET /api/access/roles` và `/members`. Đặt lại mật khẩu: `client/pages/settings/reset-password.tsx` trên `POST /api/users/{id}/resetPassword` rồi `revokeSessions` (chỉ sau khi đặt thành công, để một lần đặt lỗi không đăng xuất ai).
- Test: `tests/client/new-member-role.test.tsx`, `tests/client/reset-password.test.tsx`, `tests/server/reset-password.test.ts` (đặt lại thật: mật khẩu mới đăng nhập được, cũ thì không, người thường bị từ chối, mật khẩu ngắn bị từ chối), `tests/client/invite-members.test.tsx`; luồng mời thật (mời, nhận, vào dự án) đã có ở `tests/server/invitations.test.ts` và `tests/server/sign-up-closed.test.ts`.
