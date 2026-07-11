# Mobile Expo Template

This is a starter template for a mobile application using Expo and React Native with the following technologies:

- **Framework**: Expo (with Expo Router)
- **Language**: TypeScript
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Navigation**: Expo Router

## Getting Started

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npx expo start
    ```
3.  **Open on your device**: Scan the QR code with the Expo Go app on your phone or tablet.

## Project Structure

```
mobile-expo/
├── assets/             # Static assets (images, fonts)
├── app/                # Expo Router application routes
│   ├── (tabs)/         # Example tab-based navigation
│   ├── _layout.tsx     # Root layout for Expo Router
│   └── index.tsx       # Home screen
├── components/         # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/                # Utility functions
├── tailwind.config.js  # NativeWind configuration
├── tsconfig.json       # TypeScript configuration
├── package.json        # Project dependencies
└── README.md           # This file
```
