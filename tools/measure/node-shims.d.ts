// @types/node を持ち込まないための最小宣言。使う API だけを書く

declare module "node:child_process" {
    export function execFileSync(file: string, args: string[]): unknown
    export function spawn(
        file: string,
        args: string[]
    ): {
        stdout: { on(event: "data", cb: (chunk: unknown) => void): void }
        on(event: "error", cb: (err: unknown) => void): void
        kill(signal?: string): void
    }
}

declare module "node:fs" {
    export function readdirSync(path: string): string[]
    export function readFileSync(path: string, encoding: "utf8"): string
    export function writeFileSync(path: string, data: string): void
    export function existsSync(path: string): boolean
    export function mkdirSync(path: string, opts: { recursive: boolean }): void
}

declare module "node:test" {
    function test(name: string, fn: () => void): void
    export = test
}

declare module "node:assert" {
    namespace assert {
        function deepStrictEqual(actual: unknown, expected: unknown): void
        function strictEqual(actual: unknown, expected: unknown): void
        function throws(fn: () => void): void
    }
    export = assert
}

declare const process: {
    argv: string[]
    exitCode: number
}

declare function setTimeout(cb: () => void, ms: number): unknown

declare const console: {
    log(msg: string): void
    error(msg: string): void
}
