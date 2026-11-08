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

## Họ làm được gì sau khi vào

Lời mời **không mang vai trò**. Quyền của người mới đến từ **vai trò mặc định** do owner đặt (`PUT /api/access/settings`, mặc định là _không có_): chưa đặt thì họ vào được dự án
nhưng chưa xem được việc nào. Giao diện đặt vai trò mặc định và xem ai đang nhận nó là bước M2.2 của `docs/plans/2026-11-08-studio-hoan-thien-theo-tai-lieu.md`;
trước đó gán vai trò tay ở Người dùng → sửa.

## Cho người làm kỹ thuật

- Thành phần dùng chung: `client/components/invite-members.tsx` (`InviteMembers`, `PendingInvitations`), bọc `InviteDialog` và `InvitationsSection` của plugin projects.
- Ai thấy nút khớp với server (`POST /api/projects/invitations`): quyền `invite` trên mục `pm.members` (mời vào mọi dự án hoặc không dự án nào), hoặc là trưởng dự án (chỉ dự án đó, bắt buộc chọn).
  Server kiểm lại mọi lần; giao diện chỉ ẩn nút.
- `canUseSetting` của plugin không chịu được `viewer` thiếu `permissions` (lúc `GET /projects/me` đang tải hoặc trả dữ liệu lạ): `useMayInvite` bảo vệ chỗ đó.
- Test: `tests/client/invite-members.test.tsx`; luồng mời thật (mời, nhận, vào dự án) đã có ở `tests/server/invitations.test.ts` và `tests/server/sign-up-closed.test.ts`.
