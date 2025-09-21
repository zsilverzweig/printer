# AI Agent Guidance for Building Printer

**This file contains guidance for AI assistants (like Cursor) to help code the Printer application. It should not be displayed in the web interface.**

## Core Principles

**Keep responses under 1,000 tokens** - Be concise and focused. Break complex topics into multiple responses if needed.

Follow Single Responsibility Principles

Never commit files unless explicitly directed to.

Assume that there is a pattern already in place to solve problems, don't create a new one. If you can't find a pattern, ask the user for more guidance.

Follow a folder structure along these lines:

```
src/
├── features/ # Feature Domains
│ └── feature-name/ # Specific business domain
│ ├── components/ # Feature-specific UI components
│ ├── services/ # Feature-specific business logic
│ ├── hooks/ # Feature-specific state management
│ ├── types/ # Feature-specific TypeScript types
│ └── utils/ # Feature-specific utility functions
└── lib/ # Shared Utilities
  ├── components/ # Reusable UI components
  ├── services/ # Shared services and integrations
  ├── hooks/ # Shared state management hooks
  ├── types/ # Shared TypeScript types
  └── utils/ # Shared utility functions
```
