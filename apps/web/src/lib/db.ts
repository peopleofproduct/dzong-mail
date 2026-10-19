// Server-only database access. Import from here in route handlers and
// server components — never from client components.
export { prisma } from "@unwalled/database";
