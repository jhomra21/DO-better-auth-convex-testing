import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tasks").collect();
  },
});

export const add = mutation({
  args: {
    text: v.string(),
    isCompleted: v.optional(v.boolean()), // Optional, defaults to false on the client
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", { 
      text: args.text, 
      isCompleted: args.isCompleted ?? false 
    });
    return taskId;
  },
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    text: v.optional(v.string()),
    isCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...rest } = args;
    await ctx.db.patch(id, rest);
    // Consider returning the updated task or a success status
    return null;
  },
});

export const deleteMutation = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    // Consider returning a success status or the id of the deleted task
    return null;
  },
});