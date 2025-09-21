# Development

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety and better developer experience
- **Tailwind CSS** - Utility-first CSS framework
- **ShadCN UI** - Beautiful, accessible component library
- **Remark** - Markdown parsing and processing

## Features

- **Clean Documentation Site**: Browse all markdown files in the `docs/` directory
- **Internal Navigation**: Click internal links to navigate between documents
- **Responsive Design**: Works on desktop and mobile devices
- **ShadCN Styling**: Consistent, professional UI components
- **Dark Mode**: Default dark theme with proper contrast

## Project Structure

```
src/
├── features/           # Feature Domains
│   └── feature-name/   # Specific business domain
│       ├── components/ # Feature-specific UI components
│       ├── services/   # Feature-specific business logic
│       ├── hooks/      # Feature-specific state management
│       ├── types/      # Feature-specific TypeScript types
│       └── utils/      # Feature-specific utility functions
└── lib/                # Shared Utilities
    ├── components/     # Reusable UI components
    ├── services/       # Shared services and integrations
    ├── hooks/          # Shared state management hooks
    ├── types/          # Shared TypeScript types
    └── utils/          # Shared utility functions
```

## Adding New Documentation

1. Add markdown files to the `docs/` directory
2. Files will automatically appear in the sidebar navigation
3. Use internal links with relative paths to link between documents

## Building for Production

```bash
npm run build
npm start
```

## Deployment

The site can be deployed to any static hosting service that supports Next.js:

- **Vercel** (recommended)
- **Netlify**
- **GitHub Pages**
- **Firebase Hosting**
