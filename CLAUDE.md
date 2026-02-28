# Standing Instructions for Claude Code

## Session Start Protocol

At the start of every new session, before doing anything else:
1. Read CLAUDE.md
2. Read PROGRESS.md
3. Read SYSTEM_PROMPTS.md
4. Confirm current build state out loud
5. Then and only then proceed

## Context Management

Update PROGRESS.md at these trigger points without being asked:
- After every file is created or modified
- After every verification check completes
- After every major decision is made
- Whenever context reaches 10% remaining
- At the start of every new session — read PROGRESS.md first and confirm current state before doing anything

## System Prompt Protection

Whenever any agent system prompt is created or modified, immediately update SYSTEM_PROMPTS.md with the full untruncated text. Never truncate system prompts in this file.

## Build Discipline

- Never build features not in SoloSail_Project_Spec.docx without explicit approval
- Demo path only — no auth, no database, no mobile responsiveness until after the hackathon
- Always run TypeScript compiler check (tsc --noEmit) after completing any file
- Never use `: any` types
