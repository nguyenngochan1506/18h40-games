# Đóng góp cho 18h40 games

Cảm ơn bạn đã tham gia. Tài liệu này mô tả cách làm việc chung. Kiến trúc và cách thêm game: [README.md](README.md), [ADDING_A_GAME.md](ADDING_A_GAME.md), [specs/](specs/).

## Quy trình

```
Issue → nhánh → commit → Pull Request → CI xanh → review → merge
```

1. **Chọn hoặc mở issue.** Mỗi việc có một issue ghi mục tiêu và tiêu chí xong. Comment "mình nhận" để khỏi làm trùng; chủ dự án gán người làm (Assignee).
2. **Tạo nhánh từ `main` mới nhất**, đặt tên theo loại việc: `feat/uno-engine`, `fix/seat-sync`, `docs/readme`.
3. **Commit nhỏ, một ý**, theo [Conventional Commits](https://www.conventionalcommits.org/) bằng tiếng Việt: `feat(uno): cài luật rút bài`, `fix(server): sửa ...`, `docs: ...`, `refactor`, `test`, `chore`, `ci`.
4. **Chạy `pnpm check` cho xanh** trước khi mở PR (xem mục Cài đặt).
5. **Mở Pull Request vào `main`**, điền mẫu PR, ghi `Closes #<số issue>`. Chưa xong thì mở **Draft PR** để xin góp ý sớm.
6. **CI** (`pnpm check`) tự chạy; phải xanh mới merge được.
7. **Review**: cần ít nhất 1 người duyệt. Sửa theo góp ý bằng cách commit thêm vào cùng nhánh. Giải quyết hết bình luận trước khi merge.
8. **Merge** bằng **Squash and merge**, rồi xóa nhánh.

`main` được bảo vệ: không push thẳng, bắt buộc PR, CI xanh và 1 review.

## Cài đặt

Làm theo [README.md](README.md) (Rust edition 2024, Node.js 26, pnpm). Kiểm tra toàn bộ trước khi mở PR:

```sh
pnpm install --frozen-lockfile
pnpm check   # fmt, clippy -D warnings, test Rust, ranh giới game, test web, typecheck, build
```

Đổi kiểu Rust của protocol thì chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng PR.

## Quy ước

- **PR nhỏ, một mục đích.** Chia nhỏ: engine một PR, adapter server một PR, giao diện một PR. PR vài nghìn dòng rất khó duyệt.
- **Làm game mới trong thư mục của game đó** (`crates/<id>`, `apps/server/src/games/<id>.rs`, `apps/web/src/games/<id>/`). **Không import** từ game khác; CI chặn.
- **Không tự sửa vùng nền tảng** khi làm game: `crates/protocol`, `apps/server/src/rooms.rs`, `apps/server/src/games/mod.rs`, `apps/web/src/{app,shared}`, `apps/web/src/games/{registry,types}.ts`. Cần đổi thì mở issue bàn trước. Các vùng này có `CODEOWNERS` tự gọi người duyệt.
- **Có test cho phần mới.** Game phải qua checklist test trong [ADDING_A_GAME.md](ADDING_A_GAME.md) (fuzz, lọc thông tin ẩn, lỗi không đổi state/RNG/seq).
- **Đổi hình dạng wire (protocol)** phải nói rõ trong PR: server và web phải deploy cùng nhau, phòng đang chạy sẽ rớt.
- **Không lộ thông tin ẩn của người chơi** (bài trên tay, vai) qua view hoặc event; xem [specs/technical-rule.md](specs/technical-rule.md).
- **Chuỗi hiển thị bằng tiếng Việt**; hỗ trợ bàn phím và `prefers-reduced-motion`.
- **Art, âm thanh, font**: chỉ thêm thứ bạn tự làm hoặc có giấy phép cho phép phân phối lại; ghi nguồn trong `specs/games/<id>/assets.md`.
- Không commit file tạm hoặc sản phẩm build (`dist/`, `target/`, `node_modules/`).

## Cập nhật nhánh khi `main` đã đi tiếp

```sh
git fetch origin
git rebase origin/main
git push --force-with-lease
```

(`--force-with-lease` chỉ dùng cho nhánh của chính bạn, không bao giờ cho `main`.)

## Báo lỗi và đề xuất

Dùng [Issues](../../issues) với mẫu có sẵn. Lỗi bảo mật thì nhắn riêng chủ dự án, đừng mở issue công khai.
