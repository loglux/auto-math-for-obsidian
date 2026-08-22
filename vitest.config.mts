import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        include: ["test/**/*.test.ts"],
    },
    resolve: {
        alias: {
            obsidian: path.resolve(import.meta.dirname, "test/mocks/obsidian.ts"),
        },
    },
});
