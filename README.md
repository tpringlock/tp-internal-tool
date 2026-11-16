This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Cài đặt (đọc trước khi `npm ci`)

Gói `xlsx` (SheetJS 0.20.3) không lấy từ npm registry mà từ tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (bản trên npm đã ngừng cập nhật và còn lỗ hổng bảo mật). Từ npm 12, mặc định `allow-remote = none` nên lệnh cài sẽ dừng với lỗi:

```
npm error code EALLOWREMOTE
npm error Refusing to fetch "xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

Cách cài: cho phép tarball từ xa riêng cho lần chạy đó (lock file đã ghim `integrity` của gói nên nội dung vẫn được kiểm tra):

```bash
npm ci --allow-remote=all
```

Không cần sửa `.npmrc`. npm 11 trở xuống không gặp lỗi này, `npm ci` chạy bình thường.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
