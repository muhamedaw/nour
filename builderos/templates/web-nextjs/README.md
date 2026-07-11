# Next.js Web Template

This is a starter template for a Next.js 14+ web application with the following technologies:

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Animation**: Framer Motion
- **Icons**: Lucide Icons

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
3.  **Open in Browser**: Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
web-nextjs/
├── public/             # Static assets
├── src/
│   ├── app/            # Next.js App Router
│   │   ├── (auth)/     # Example auth routes
│   │   ├── api/        # API routes
│   │   ├── components/ # Reusable UI components
│   │   ├── lib/        # Utility functions
│   │   ├── styles/     # Global styles
│   │   └── layout.tsx  # Root layout
│   │   └── page.tsx    # Home page
│   ├── types/          # TypeScript type definitions
│   └── hooks/          # React hooks
├── .env.example        # Environment variables example
├── components.json     # shadcn/ui configuration
├── next.config.js      # Next.js configuration
├── package.json        # Project dependencies
├── postcss.config.js   # PostCSS configuration
├── tailwind.config.ts  # Tailwind CSS configuration
├── tsconfig.json       # TypeScript configuration
└── README.md           # This file
```
