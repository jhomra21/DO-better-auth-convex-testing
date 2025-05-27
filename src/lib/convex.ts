import { ConvexClient } from "convex/browser";

const convex_url = import.meta.env.VITE_CONVEX_URL;

if (!convex_url) {
  throw new Error("VITE_CONVEX_URL is not set. Please set it in your .env file (e.g., .env.local or .env.development.local for Vite projects).");
}

export const convex = new ConvexClient(convex_url); 