import type { ErrorCode } from '../../generated/protocol';

export const errorMessages: Record<ErrorCode, string> = {
  unsupported_version: 'Phiên bản không tương thích. Hãy tải lại trang.',
  invalid_message: 'Không gửi được yêu cầu này. Hãy tải lại trang và thử lại.',
  room_not_found: 'Phòng không còn tồn tại. Hãy tạo phòng hoặc kiểm tra lại mã phòng.',
  nickname_taken: 'Tên này đã có người dùng trong phòng. Hãy chọn tên khác.',
  invalid_nickname: 'Tên cần có từ 1 đến 20 ký tự và không chứa ký tự điều khiển.',
  invalid_token: 'Phiên vào phòng đã hết hiệu lực. Hãy nhập tên và vào lại.',
  already_in_room: 'Bạn đang ở trong một phòng. Hãy rời phòng trước khi vào phòng khác.',
  not_in_room: 'Bạn chưa ở trong phòng. Hãy tạo phòng hoặc nhập mã phòng.',
  not_host: 'Chỉ chủ phòng có thể thực hiện thao tác này. Hãy nhờ chủ phòng xác nhận.',
  wrong_phase: 'Trạng thái phòng đã thay đổi. Hãy kiểm tra lại các thao tác hiện có.',
  not_enough_players: 'Chưa đủ người chơi để bắt đầu. Hãy mời thêm bạn tham gia ván.',
  no_free_seat: 'Các ghế chơi đã đủ. Bạn vẫn có thể ở lại làm khán giả.',
  invalid_settings: 'Cài đặt trò chơi chưa hợp lệ. Hãy kiểm tra số người và các lựa chọn.',
  game_unavailable: 'Trò chơi chưa sẵn sàng. Hãy chọn game khác.',
  illegal_action: 'Không thể thực hiện hành động này. Hãy kiểm tra lượt và lựa chọn hiện tại.',
  server_busy: 'Phòng hoặc máy chủ đã đầy. Hãy thử phòng khác hoặc quay lại sau.',
};
