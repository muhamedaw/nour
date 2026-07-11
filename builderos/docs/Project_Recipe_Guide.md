# BuilderOS v2: Project Recipe Guide

This guide provides a step-by-step approach to leveraging BuilderOS v2 for efficient and streamlined project development. By following these recipes, you can ensure a smooth workflow, consistent architecture, and optimal resource utilization.

## 1. Starting a New Project with `gh2 init`

The `gh2 init` command allows you to quickly scaffold a new project based on predefined templates. This ensures your project starts with a production-ready structure and best practices.

### Usage

```bash
gh2 init <template-name> <project-path>
```

- `<template-name>`: The name of the template to use (e.g., `web-nextjs`, `api-fastapi`, `mobile-expo`).
- `<project-path>`: The desired directory for your new project.

### Available Templates

To see a list of available templates, run `gh2` without any arguments:

```bash
gh2
```

This will list the template directories available in `BuilderOS/templates/`.

### Example: Creating a Next.js Web Project

```bash
gh2 init web-nextjs my-new-web-app
cd my-new-web-app
npm install
npm run dev
```

## 2. Applying Blueprints with `gh2 blueprint`

Blueprints are JSON/YAML files that describe specific features or modules you want to add to an existing project. The `gh2 blueprint` command processes these files to generate the necessary directories and files, adhering to your project's established architecture.

### Usage

```bash
gh2 blueprint <blueprint-file>
```

- `<blueprint-file>`: The path to your blueprint JSON/YAML file.

### Blueprint Structure

A blueprint file typically contains:

- `name`: A descriptive name for the feature.
- `directories`: A list of directories to create.
- `files`: A list of files to create, including their paths and initial content.

### Example: Adding an Authentication Module

Let's say you have a blueprint file `auth_module.json`:

```json
{
  "name": "Authentication Module",
  "directories": [
    "src/auth",
    "src/auth/components",
    "src/auth/services"
  ],
  "files": [
    {
      "path": "src/auth/index.ts",
      "content": "export * from \"./components\";\nexport * from \"./services\";"
    },
    {
      "path": "src/auth/components/LoginForm.tsx",
      "content": "// Basic login form component"
    }
  ]
}
```

To apply this blueprint:

```bash
gh2 blueprint auth_module.json
```

## 3. Auditing Your Project with `gh2 audit`

The `gh2 audit` command helps you ensure your project adheres to BuilderOS standards and has all the necessary tools and configurations.

### Usage

```bash
gh2 audit
```

This command will check for missing linters, formatters, testing setups, and other essential development tools, and suggest actions to fix them.

## 4. Token-Saving Strategies for Efficient Development

BuilderOS v2 is designed to optimize your interaction with AI models, ensuring concise and effective communication, thereby saving tokens.

- **Be Specific**: When making requests, be as precise as possible. Avoid vague language.
- **Leverage Registries**: Refer to `TOOL_REGISTRY.md` and `SKILLS_REGISTRY.md` to understand existing capabilities rather than asking for explanations.
- **Use Blueprints for Repetitive Tasks**: Instead of describing file structures repeatedly, define them once in a blueprint.
- **Focus on Incremental Changes**: Break down large tasks into smaller, manageable steps. This allows for focused responses and reduces the need for extensive context.
- **Review `CLAUDE.md`**: Familiarize yourself with the `Token Optimization Rules` section in `CLAUDE.md` for detailed guidance on crafting efficient prompts.

By following these guidelines, you can maximize the efficiency of BuilderOS v2 and accelerate your development workflow.
